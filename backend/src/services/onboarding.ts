import fs from "fs/promises";
import {
  FirmLibraryFieldRole,
  FolderKey,
  OnboardingPackItemStatus,
  OnboardingPaymentKind,
  OnboardingRunStatus,
  OnboardingStatus,
  SignatureStatus,
  UserRole,
  UserStatus,
} from "@prisma/client";
import { env } from "../config/env";
import { ensureFoldersForOrganisation } from "../lib/folders";
import { sendMail } from "../lib/mail";
import { clientUserIdsForOrg, notifyUsers } from "../lib/notifications";
import { prisma } from "../lib/prisma";
import { absoluteStoragePath } from "../lib/storage";
import { uploadDocument } from "./documents";
import { firmLibraryFieldHasAdminInk } from "./firmLibrary";
import {
  createDraftFromDocument,
  fieldIsComplete,
  getSignatureRequestById,
  markReady,
  replaceFields,
  sendForSignature,
  signSignatureRequest,
} from "./signatures";

function roundGeom(n: number) {
  return Math.round(Number(n) * 10000) / 10000;
}

function fieldGeomKey(f: {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
}) {
  return [
    f.page,
    roundGeom(f.x),
    roundGeom(f.y),
    roundGeom(f.width),
    roundGeom(f.height),
    String(f.type),
  ].join("|");
}

const runInclude = {
  organisation: {
    select: {
      id: true,
      name: true,
      contactName: true,
      email: true,
      onboardingStatus: true,
      users: {
        where: { role: UserRole.client, status: "active" },
        select: { id: true, name: true, email: true },
        take: 5,
      },
    },
  },
  packItems: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      clientDocument: { select: { id: true, title: true, folderId: true } },
      signatureRequest: {
        select: {
          id: true,
          status: true,
          title: true,
          publishedDocuments: {
            where: { isSignedCopy: true },
            select: { id: true, title: true },
            take: 1,
            orderBy: { createdAt: "desc" as const },
          },
        },
      },
    },
  },
  paymentLinks: true,
} as const;

function httpError(message: string, status: number, code: string) {
  return Object.assign(new Error(message), { status, code });
}

export function defaultWelcomeEmail(org: {
  name: string;
  contactName: string | null;
}) {
  const first = (org.contactName || "there").split(" ")[0];
  const subject = `Welcome to DM.HR Group | Your Client Onboarding`;
  const body = `Hello ${first},

Welcome to DM.HR Group. We look forward to supporting ${org.name}.

Please sign in to the client portal to review your onboarding checklist in My Onboarding, complete any documents that require your signature, and follow the payment links when they are provided.

Portal: ${env.FRONTEND_URL}/portal/onboarding

Kind regards,
DM.HR Group`;
  return { subject, body };
}

export async function listOnboardingRuns() {
  return prisma.onboardingRun.findMany({
    orderBy: { updatedAt: "desc" },
    include: runInclude,
  });
}

export async function getOnboardingRunById(id: string) {
  return prisma.onboardingRun.findUnique({
    where: { id },
    include: runInclude,
  });
}

export async function getActiveRunForOrg(organisationId: string) {
  return prisma.onboardingRun.findFirst({
    where: {
      organisationId,
      status: OnboardingRunStatus.in_progress,
    },
    orderBy: { startedAt: "desc" },
    include: runInclude,
  });
}

export async function getClientJourney(organisationId: string) {
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { id: true, name: true, onboardingStatus: true },
  });
  if (!org) throw httpError("Organisation not found", 404, "NOT_FOUND");

  if (org.onboardingStatus === OnboardingStatus.existing_skip) {
    return { organisation: org, run: null, skipped: true as const };
  }

  const run =
    (await getActiveRunForOrg(organisationId)) ||
    (await prisma.onboardingRun.findFirst({
      where: { organisationId },
      orderBy: { startedAt: "desc" },
      include: runInclude,
    }));

  return { organisation: org, run, skipped: false as const };
}

async function myOnboardingFolder(organisationId: string) {
  await ensureFoldersForOrganisation(prisma, organisationId);
  const folder = await prisma.documentFolder.findFirst({
    where: { organisationId, key: FolderKey.my_onboarding },
  });
  if (!folder) throw httpError("My Onboarding folder missing", 500, "SERVER_ERROR");
  return folder;
}

/** Start (or reopen) onboarding for a company that needs it. */
export async function startOnboarding(params: {
  organisationId: string;
  startedById: string;
}) {
  const org = await prisma.organisation.findUnique({
    where: { id: params.organisationId },
  });
  if (!org) throw httpError("Organisation not found", 404, "NOT_FOUND");
  if (org.onboardingStatus === OnboardingStatus.existing_skip) {
    throw httpError(
      "This company is marked already onboarded — change status to Needs onboarding first",
      409,
      "INVALID_STATUS"
    );
  }
  if (org.onboardingStatus === OnboardingStatus.completed) {
    throw httpError("Onboarding already completed for this company", 409, "INVALID_STATUS");
  }

  const existing = await getActiveRunForOrg(params.organisationId);
  if (existing) return existing;

  await ensureFoldersForOrganisation(prisma, params.organisationId);

  if (org.onboardingStatus !== OnboardingStatus.in_progress) {
    await prisma.organisation.update({
      where: { id: org.id },
      data: { onboardingStatus: OnboardingStatus.in_progress },
    });
  }

  const welcome = defaultWelcomeEmail(org);
  const created = await prisma.onboardingRun.create({
    data: {
      organisationId: org.id,
      status: OnboardingRunStatus.in_progress,
      welcomeEmailSubject: welcome.subject,
      welcomeEmailBody: welcome.body,
    },
    include: runInclude,
  });

  return created;
}

export async function sendWelcomeEmail(params: {
  runId: string;
  subject?: string;
  body?: string;
}) {
  const run = await getOnboardingRunById(params.runId);
  if (!run) throw httpError("Onboarding run not found", 404, "NOT_FOUND");
  if (run.status !== OnboardingRunStatus.in_progress) {
    throw httpError("Onboarding is not in progress", 409, "INVALID_STATUS");
  }

  const subject = (params.subject || run.welcomeEmailSubject || "").trim();
  const body = (params.body || run.welcomeEmailBody || "").trim();
  if (!subject || !body) {
    throw httpError("Welcome email subject and body are required", 400, "VALIDATION_ERROR");
  }

  const recipients = [
    ...new Set(
      [
        run.organisation.email,
        ...run.organisation.users.map((u) => u.email),
      ].filter((e): e is string => Boolean(e))
    ),
  ];
  if (recipients.length === 0) {
    throw httpError("No client email on file to send welcome email", 400, "VALIDATION_ERROR");
  }

  const mailResult = await sendMail({ to: recipients, subject, text: body });
  if (mailResult === "skipped") {
    throw httpError(
      "SMTP is not configured — set Admin Settings → SMTP before sending welcome email",
      400,
      "SMTP_REQUIRED"
    );
  }
  if (mailResult === "failed") {
    throw httpError("Welcome email failed to send — check SMTP settings", 500, "MAIL_FAILED");
  }

  const updated = await prisma.onboardingRun.update({
    where: { id: run.id },
    data: {
      welcomeEmailSentAt: new Date(),
      welcomeEmailSubject: subject,
      welcomeEmailBody: body,
    },
    include: runInclude,
  });

  const userIds = await clientUserIdsForOrg(run.organisationId);
  await notifyUsers({
    userIds,
    organisationId: run.organisationId,
    title: "Welcome — onboarding started",
    body: `Your onboarding with DM.HR Group has started. Open My Onboarding to continue.`,
    href: `/portal/onboarding`,
  });

  return updated;
}

export async function issuePackFromLibrary(params: {
  runId: string;
  libraryDocumentIds: string[];
  issuedById: string;
}) {
  const run = await getOnboardingRunById(params.runId);
  if (!run) throw httpError("Onboarding run not found", 404, "NOT_FOUND");
  if (run.status !== OnboardingRunStatus.in_progress) {
    throw httpError("Onboarding is not in progress", 409, "INVALID_STATUS");
  }
  if (!params.libraryDocumentIds.length) {
    throw httpError("Select at least one library document", 400, "VALIDATION_ERROR");
  }

  const libraryDocs = await prisma.firmLibraryDocument.findMany({
    where: { id: { in: params.libraryDocumentIds } },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
  if (libraryDocs.length !== params.libraryDocumentIds.length) {
    throw httpError("One or more library documents were not found", 404, "NOT_FOUND");
  }

  for (const lib of libraryDocs) {
    if (lib.requiresSignature && lib.fields.length === 0) {
      throw httpError(
        `“${lib.title}” requires signature — prepare boxes once in Firm Library before issuing`,
        400,
        "TEMPLATE_FIELDS_REQUIRED"
      );
    }
    if (lib.requiresSignature && !lib.fields.every((f) => firmLibraryFieldHasAdminInk(f))) {
      throw httpError(
        `“${lib.title}” — sign Admin boxes once on Firm Library (saved forever) before issuing`,
        400,
        "ADMIN_INK_REQUIRED"
      );
    }
  }

  const primaryClient = await prisma.user.findFirst({
    where: {
      organisationId: run.organisationId,
      role: UserRole.client,
      status: UserStatus.active,
    },
    orderBy: { createdAt: "asc" },
  });
  if (!primaryClient) {
    throw httpError(
      "This company has no active client login to assign signature fields",
      400,
      "VALIDATION_ERROR"
    );
  }

  const issuer = await prisma.user.findUnique({
    where: { id: params.issuedById },
    select: { id: true, name: true },
  });
  if (!issuer) throw httpError("Issuer not found", 404, "NOT_FOUND");

  const folder = await myOnboardingFolder(run.organisationId);
  const ordered = params.libraryDocumentIds
    .map((id) => libraryDocs.find((d) => d.id === id)!)
    .filter(Boolean);

  let sortBase = run.packItems.length;
  let issuedSignCount = 0;
  for (const lib of ordered) {
    const already = run.packItems.find((p) => p.libraryDocumentId === lib.id);
    if (already) continue;

    const bytes = await fs.readFile(absoluteStoragePath(lib.storagePath));
    const uploaded = await uploadDocument({
      organisationId: run.organisationId,
      folderId: folder.id,
      userId: params.issuedById,
      file: {
        originalName: lib.fileName,
        mimeType: lib.mimeType,
        size: lib.sizeBytes,
        buffer: bytes,
      },
    });
    if (uploaded.error || !uploaded.document) {
      throw httpError(
        uploaded.error?.message || "Failed to issue document",
        uploaded.error?.status || 500,
        uploaded.error?.code || "SERVER_ERROR"
      );
    }

    // Prefer library title on the client copy
    await prisma.document.update({
      where: { id: uploaded.document.id },
      data: { title: lib.title },
    });

    let signatureRequestId: string | null = null;
    let packStatus: OnboardingPackItemStatus = lib.requiresSignature
      ? OnboardingPackItemStatus.issued
      : OnboardingPackItemStatus.done;

    if (lib.requiresSignature && lib.fields.length > 0) {
      const { request } = await createDraftFromDocument({
        organisationId: run.organisationId,
        sourceDocumentId: uploaded.document.id,
        createdById: params.issuedById,
        title: lib.title,
      });

      await replaceFields({
        id: request.id,
        fields: lib.fields.map((f, i) => ({
          type: f.type,
          page: f.page,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          label: f.label,
          required: f.required,
          sortOrder: f.sortOrder ?? i,
          assigneeUserId:
            f.role === FirmLibraryFieldRole.admin
              ? params.issuedById
              : primaryClient.id,
        })),
      });

      await markReady(request.id);

      const readyReq = await getSignatureRequestById(request.id);
      if (!readyReq) throw httpError("Signature request missing after Mark Ready", 500, "SERVER_ERROR");

      const adminTpl = lib.fields.filter((f) => f.role === FirmLibraryFieldRole.admin);
      if (adminTpl.length > 0) {
        const fieldImages: Record<string, Buffer> = {};
        const fieldTexts: Record<string, string> = {};
        const liveByGeom = new Map(
          readyReq.fields.map((f) => [fieldGeomKey(f), f] as const)
        );
        const usedLiveIds = new Set<string>();

        for (const tpl of adminTpl) {
          const geom = fieldGeomKey(tpl);
          let live =
            liveByGeom.get(geom) ||
            readyReq.fields.find(
              (f) =>
                !usedLiveIds.has(f.id) &&
                f.assigneeUserId === params.issuedById &&
                f.type === tpl.type &&
                f.sortOrder === tpl.sortOrder
            ) ||
            readyReq.fields.find(
              (f) =>
                !usedLiveIds.has(f.id) &&
                f.assigneeUserId === params.issuedById &&
                f.type === tpl.type &&
                f.page === tpl.page
            );

          if (!live) {
            throw httpError(
              `Could not map Admin field “${tpl.label}” onto the issued signature request`,
              500,
              "SERVER_ERROR"
            );
          }
          usedLiveIds.add(live.id);

          if (tpl.signedImagePath) {
            fieldImages[live.id] = await fs.readFile(absoluteStoragePath(tpl.signedImagePath));
          }
          if (tpl.valueText?.trim()) {
            fieldTexts[live.id] = tpl.valueText.trim();
          }

          if (tpl.required && !fieldImages[live.id] && !fieldTexts[live.id]) {
            throw httpError(
              `Admin ink missing for “${tpl.label}” — save Admin ink in Firm Library, then issue again`,
              400,
              "VALIDATION_ERROR"
            );
          }
        }

        await signSignatureRequest({
          id: request.id,
          organisationId: run.organisationId,
          signedById: issuer.id,
          typedName: issuer.name || "DM.HR Admin",
          ip: null,
          fieldImages,
          fieldTexts,
        });
      }

      const afterAdmin = await getSignatureRequestById(request.id);
      if (!afterAdmin) {
        throw httpError("Signature request missing after admin ink", 500, "SERVER_ERROR");
      }

      if (adminTpl.length > 0) {
        const adminLive = afterAdmin.fields.filter(
          (f) => f.assigneeUserId === params.issuedById
        );
        const incompleteAdmin = adminLive.filter((f) => f.required && !fieldIsComplete(f));
        if (incompleteAdmin.length) {
          throw httpError(
            `Admin ink did not apply to ${incompleteAdmin.length} field(s) — check Firm Library layout and re-issue`,
            500,
            "SERVER_ERROR"
          );
        }
      }

      if (
        afterAdmin.status === SignatureStatus.signed_returned ||
        afterAdmin.status === SignatureStatus.reviewed
      ) {
        signatureRequestId = afterAdmin.id;
        packStatus =
          afterAdmin.status === SignatureStatus.reviewed
            ? OnboardingPackItemStatus.reviewed
            : OnboardingPackItemStatus.signed;
      } else {
        const sent = await sendForSignature(request.id);
        signatureRequestId = sent.id;
        packStatus = OnboardingPackItemStatus.awaiting_signature;
      }
      issuedSignCount += 1;
    }

    await prisma.onboardingPackItem.create({
      data: {
        runId: run.id,
        libraryDocumentId: lib.id,
        clientDocumentId: uploaded.document.id,
        title: lib.title,
        requiresSignature: lib.requiresSignature,
        journeyRole: lib.journeyRole,
        status: packStatus,
        signatureRequestId,
        sortOrder: sortBase++,
      },
    });
  }

  const refreshed = await getOnboardingRunById(run.id);
  const userIds = await clientUserIdsForOrg(run.organisationId);
  await notifyUsers({
    userIds,
    organisationId: run.organisationId,
    title: "Onboarding documents ready",
    body:
      issuedSignCount > 0
        ? `${issuedSignCount} document(s) are ready to sign in My Onboarding.`
        : `New documents were added to My Onboarding for ${run.organisation.name}.`,
    href: `/portal/onboarding`,
  });

  return refreshed;
}

export async function linkPackItemSignature(params: {
  packItemId: string;
  signatureRequestId: string;
}) {
  const item = await prisma.onboardingPackItem.findUnique({
    where: { id: params.packItemId },
    include: { run: true },
  });
  if (!item) throw httpError("Pack item not found", 404, "NOT_FOUND");

  const req = await prisma.signatureRequest.findUnique({
    where: { id: params.signatureRequestId },
  });
  if (!req || req.organisationId !== item.run.organisationId) {
    throw httpError("Signature request not found for this organisation", 404, "NOT_FOUND");
  }

  return prisma.onboardingPackItem.update({
    where: { id: item.id },
    data: {
      signatureRequestId: req.id,
      status:
        req.status === SignatureStatus.reviewed
          ? OnboardingPackItemStatus.reviewed
          : req.status === SignatureStatus.signed_returned
            ? OnboardingPackItemStatus.signed
            : OnboardingPackItemStatus.awaiting_signature,
    },
  });
}

/** Keep pack item in sync when an e-sign request changes status. */
export async function syncPackItemFromSignatureRequest(signatureRequestId: string) {
  const req = await prisma.signatureRequest.findUnique({
    where: { id: signatureRequestId },
    select: { id: true, status: true, sourceDocumentId: true },
  });
  if (!req) return;

  const items = await prisma.onboardingPackItem.findMany({
    where: {
      OR: [
        { signatureRequestId: req.id },
        ...(req.sourceDocumentId ? [{ clientDocumentId: req.sourceDocumentId }] : []),
      ],
    },
  });
  if (!items.length) return;

  let status: OnboardingPackItemStatus | null = null;
  if (req.status === SignatureStatus.reviewed) status = OnboardingPackItemStatus.reviewed;
  else if (req.status === SignatureStatus.signed_returned) {
    status = OnboardingPackItemStatus.signed;
  } else if (
    req.status === SignatureStatus.awaiting_signature ||
    req.status === SignatureStatus.sent ||
    req.status === SignatureStatus.revision_requested ||
    req.status === SignatureStatus.ready_for_send
  ) {
    status = OnboardingPackItemStatus.awaiting_signature;
  }

  for (const item of items) {
    await prisma.onboardingPackItem.update({
      where: { id: item.id },
      data: {
        signatureRequestId: req.id,
        ...(status
          ? {
              status: !item.requiresSignature
                ? OnboardingPackItemStatus.done
                : status,
            }
          : {}),
      },
    });
  }
}

export async function setPaymentLink(params: {
  runId: string;
  kind: OnboardingPaymentKind;
  url: string;
}) {
  const run = await getOnboardingRunById(params.runId);
  if (!run) throw httpError("Onboarding run not found", 404, "NOT_FOUND");
  if (run.status !== OnboardingRunStatus.in_progress) {
    throw httpError("Onboarding is not in progress", 409, "INVALID_STATUS");
  }
  const url = params.url.trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    throw httpError("Enter a valid http(s) URL", 400, "VALIDATION_ERROR");
  }

  await prisma.onboardingPaymentLink.upsert({
    where: { runId_kind: { runId: run.id, kind: params.kind } },
    create: {
      runId: run.id,
      kind: params.kind,
      url,
      doneAt: new Date(),
    },
    update: { url, doneAt: new Date() },
  });

  return getOnboardingRunById(run.id);
}

export function canCompleteOnboarding(run: {
  packItems: { requiresSignature: boolean; status: OnboardingPackItemStatus }[];
  paymentLinks: { kind: OnboardingPaymentKind; url: string }[];
  welcomeEmailSentAt: Date | null;
}) {
  if (!run.welcomeEmailSentAt) {
    return { ok: false as const, reason: "Send the welcome email first" };
  }
  if (run.packItems.length === 0) {
    return { ok: false as const, reason: "Issue at least one pack document from Firm Library" };
  }
  const pendingSign = run.packItems.filter(
    (p) =>
      p.requiresSignature &&
      p.status !== OnboardingPackItemStatus.reviewed &&
      p.status !== OnboardingPackItemStatus.done
  );
  if (pendingSign.length) {
    return {
      ok: false as const,
      reason: `${pendingSign.length} pack document(s) still need signature / Admin review`,
    };
  }
  const kinds = new Set(run.paymentLinks.map((p) => p.kind));
  if (!kinds.has(OnboardingPaymentKind.direct_debit)) {
    return { ok: false as const, reason: "Add the Direct Debit setup link" };
  }
  if (!kinds.has(OnboardingPaymentKind.initial_payment)) {
    return { ok: false as const, reason: "Add the initial payment link" };
  }
  return { ok: true as const };
}

export async function completeOnboarding(params: {
  runId: string;
  completedById: string;
}) {
  const run = await getOnboardingRunById(params.runId);
  if (!run) throw httpError("Onboarding run not found", 404, "NOT_FOUND");
  if (run.status !== OnboardingRunStatus.in_progress) {
    throw httpError("Onboarding is not in progress", 409, "INVALID_STATUS");
  }

  const gate = canCompleteOnboarding(run);
  if (!gate.ok) throw httpError(gate.reason, 400, "VALIDATION_ERROR");

  await prisma.$transaction([
    prisma.onboardingRun.update({
      where: { id: run.id },
      data: {
        status: OnboardingRunStatus.completed,
        completedAt: new Date(),
      },
    }),
    prisma.organisation.update({
      where: { id: run.organisationId },
      data: { onboardingStatus: OnboardingStatus.completed },
    }),
  ]);

  const userIds = await clientUserIdsForOrg(run.organisationId);
  await notifyUsers({
    userIds,
    organisationId: run.organisationId,
    title: "Onboarding complete",
    body: `${run.organisation.name} is now a full DM.HR client. Thank you.`,
    href: `/portal/onboarding`,
  });

  return getOnboardingRunById(run.id);
}

export async function ensureOnboardingFolderForOrg(organisationId: string) {
  await ensureFoldersForOrganisation(prisma, organisationId);
}
