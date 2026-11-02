import fs from "fs/promises";
import path from "path";
import { SignatureFieldType, SignatureStatus, UserRole, UserStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { stampSignaturesOnPdf } from "../lib/pdfStamp";
import { absoluteStoragePath, writeStoredFile } from "../lib/storage";
import { adminUserIds, notifyUsers } from "../lib/notifications";
import { uploadDocument } from "./documents";

const FIELD_TYPES: SignatureFieldType[] = [
  SignatureFieldType.signature,
  SignatureFieldType.initials,
  SignatureFieldType.text,
  SignatureFieldType.date,
  SignatureFieldType.name,
];

const INK_TYPES: SignatureFieldType[] = [
  SignatureFieldType.signature,
  SignatureFieldType.initials,
];

const requestInclude = {
  organisation: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  signedBy: { select: { id: true, name: true, email: true } },
  reviewedBy: { select: { id: true, name: true, email: true } },
  fields: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      assignee: { select: { id: true, name: true, email: true, role: true } },
      signedBy: { select: { id: true, name: true, email: true } },
    },
  },
  ccRecipients: {
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  },
} as const;

/** Client may see / open only after Admin Send (plus post-sign states). */
export const CLIENT_VISIBLE_STATUSES: SignatureStatus[] = [
  SignatureStatus.awaiting_signature,
  SignatureStatus.sent,
  SignatureStatus.revision_requested,
  SignatureStatus.signed_returned,
  SignatureStatus.reviewed,
];

/** One active pipeline per source document until reviewed. */
const ACTIVE_PIPELINE_STATUSES: SignatureStatus[] = [
  SignatureStatus.draft,
  SignatureStatus.ready_for_send,
  SignatureStatus.awaiting_signature,
  SignatureStatus.sent,
  SignatureStatus.revision_requested,
  SignatureStatus.signed_returned,
];

export type FieldInput = {
  id?: string;
  type?: SignatureFieldType | string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  required?: boolean;
  sortOrder?: number;
  assigneeUserId?: string | null;
};

function httpError(message: string, status: number, code: string) {
  return Object.assign(new Error(message), { status, code });
}

/** Field placement only while drafting (frozen after Mark Ready). */
function canEditFields(status: SignatureStatus) {
  return status === SignatureStatus.draft;
}

/**
 * Fill unlocked after Mark Ready (assignees with matching login — typically admin first),
 * and after Send / revision for everyone remaining.
 */
function canFill(status: SignatureStatus) {
  return (
    status === SignatureStatus.ready_for_send ||
    status === SignatureStatus.awaiting_signature ||
    status === SignatureStatus.sent ||
    status === SignatureStatus.revision_requested
  );
}

/** @deprecated use canFill — kept for route imports */
export function canClientSign(status: SignatureStatus) {
  return canFill(status);
}

export function isClientVisibleStatus(status: SignatureStatus) {
  return CLIENT_VISIBLE_STATUSES.includes(status);
}

function parseFieldType(raw: string | undefined): SignatureFieldType {
  const t = (raw || "signature") as SignatureFieldType;
  if (!FIELD_TYPES.includes(t)) {
    throw httpError(`Invalid field type: ${raw}`, 400, "VALIDATION_ERROR");
  }
  return t;
}

function defaultLabelForType(type: SignatureFieldType): string {
  switch (type) {
    case SignatureFieldType.initials:
      return "Initials";
    case SignatureFieldType.text:
      return "Text";
    case SignatureFieldType.date:
      return "Date";
    case SignatureFieldType.name:
      return "Name";
    default:
      return "Signature";
  }
}

export function fieldIsComplete(f: {
  required: boolean;
  type: SignatureFieldType;
  signedImagePath: string | null;
  valueText: string | null;
  signedAt: Date | null;
}): boolean {
  if (!f.required) {
    return Boolean(f.signedAt || f.signedImagePath || (f.valueText && f.valueText.trim()));
  }
  if (INK_TYPES.includes(f.type)) {
    return Boolean(f.signedImagePath && f.signedAt);
  }
  return Boolean((f.valueText && f.valueText.trim()) || f.signedImagePath) && Boolean(f.signedAt);
}

export function waitingOnSummary(
  fields: {
    required: boolean;
    type: SignatureFieldType;
    signedImagePath: string | null;
    valueText: string | null;
    signedAt: Date | null;
    assignee: { id: string; name: string; email: string } | null;
  }[]
): { done: number; total: number; waitingNames: string[] } {
  const required = fields.filter((f) => f.required);
  const total = required.length || fields.length;
  const pool = required.length ? required : fields;
  const done = pool.filter((f) => fieldIsComplete(f)).length;
  const waitingIds = new Set<string>();
  const waitingNames: string[] = [];
  for (const f of pool) {
    if (fieldIsComplete(f)) continue;
    const a = f.assignee;
    if (!a || waitingIds.has(a.id)) continue;
    waitingIds.add(a.id);
    waitingNames.push(a.name || a.email);
  }
  return { done, total, waitingNames };
}

export async function listEsignAssignees(organisationId: string) {
  const [clients, admins] = await Promise.all([
    prisma.user.findMany({
      where: {
        organisationId,
        role: UserRole.client,
        status: UserStatus.active,
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true },
    }),
    prisma.user.findMany({
      where: { role: UserRole.admin, status: UserStatus.active },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true },
    }),
  ]);
  return [...admins, ...clients];
}

async function assertValidAssignees(organisationId: string, userIds: string[]) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return;
  const users = await prisma.user.findMany({
    where: {
      id: { in: unique },
      status: UserStatus.active,
      OR: [{ role: UserRole.admin }, { organisationId, role: UserRole.client }],
    },
    select: { id: true },
  });
  if (users.length !== unique.length) {
    throw httpError(
      "Each assignee must be an active admin or company user for this organisation",
      400,
      "VALIDATION_ERROR"
    );
  }
}

export async function listSignatureRequests(filter?: {
  organisationId?: string;
  /** When true, hide draft / ready_for_send from client queues */
  clientVisibleOnly?: boolean;
}) {
  return prisma.signatureRequest.findMany({
    where: {
      ...(filter?.organisationId ? { organisationId: filter.organisationId } : {}),
      ...(filter?.clientVisibleOnly ? { status: { in: CLIENT_VISIBLE_STATUSES } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: requestInclude,
  });
}

export async function getSignatureRequestById(id: string) {
  return prisma.signatureRequest.findUnique({
    where: { id },
    include: requestInclude,
  });
}

async function copySourceFromDocument(organisationId: string, sourceDocumentId: string) {
  const doc = await prisma.document.findFirst({
    where: { id: sourceDocumentId, organisationId },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  const version = doc?.versions[0];
  if (!doc || !version) {
    throw httpError("Source document not found", 404, "NOT_FOUND");
  }
  if (!version.mimeType.includes("pdf") && !version.fileName.toLowerCase().endsWith(".pdf")) {
    throw httpError("E-sign requires a PDF document", 400, "VALIDATION_ERROR");
  }
  const bytes = await fs.readFile(absoluteStoragePath(version.storagePath));
  const safeName = `${Date.now()}_${version.fileName.replace(/[^\w.\-]+/g, "_")}`;
  const sourceStoragePath = await writeStoredFile(
    path.join("signatures", organisationId, "source"),
    safeName,
    bytes
  );
  return {
    title: doc.title,
    sourceDocumentId: doc.id,
    sourceFileName: version.fileName,
    sourceMimeType: version.mimeType,
    sourceStoragePath,
    sourceSizeBytes: version.sizeBytes,
  };
}

/** Create draft from an org document (Part 4.1 primary path). Reuses active pipeline if any. */
export async function createDraftFromDocument(params: {
  organisationId: string;
  sourceDocumentId: string;
  createdById: string;
  title?: string;
}): Promise<{ request: NonNullable<Awaited<ReturnType<typeof getSignatureRequestById>>>; reused: boolean }> {
  const org = await prisma.organisation.findUnique({ where: { id: params.organisationId } });
  if (!org) throw httpError("Organisation not found", 404, "NOT_FOUND");

  const existing = await prisma.signatureRequest.findFirst({
    where: {
      organisationId: params.organisationId,
      sourceDocumentId: params.sourceDocumentId,
      status: { in: ACTIVE_PIPELINE_STATUSES },
    },
    orderBy: { updatedAt: "desc" },
    include: requestInclude,
  });
  if (existing) {
    try {
      const { syncPackItemFromSignatureRequest } = await import("./onboarding");
      await syncPackItemFromSignatureRequest(existing.id);
    } catch (err) {
      console.error("[onboarding:sync-pack]", err);
    }
    return { request: existing, reused: true };
  }

  const source = await copySourceFromDocument(params.organisationId, params.sourceDocumentId);

  const created = await prisma.signatureRequest.create({
    data: {
      organisationId: params.organisationId,
      title: (params.title || source.title).trim(),
      status: SignatureStatus.draft,
      sourceDocumentId: source.sourceDocumentId,
      sourceFileName: source.sourceFileName,
      sourceMimeType: source.sourceMimeType,
      sourceStoragePath: source.sourceStoragePath,
      sourceSizeBytes: source.sourceSizeBytes,
      createdById: params.createdById,
      sentAt: null,
    },
    include: requestInclude,
  });
  try {
    const { syncPackItemFromSignatureRequest } = await import("./onboarding");
    await syncPackItemFromSignatureRequest(created.id);
  } catch (err) {
    console.error("[onboarding:sync-pack]", err);
  }
  return { request: created, reused: false };
}

/** Legacy Part 4 create — starts as draft if no notify; keep for file upload fallback. */
export async function createSignatureRequest(params: {
  organisationId: string;
  title: string;
  createdById: string;
  sourceDocumentId?: string | null;
  file?: { buffer: Buffer; originalname: string; mimetype: string; size: number } | null;
}) {
  if (params.sourceDocumentId && !params.file) {
    const result = await createDraftFromDocument({
      organisationId: params.organisationId,
      sourceDocumentId: params.sourceDocumentId,
      createdById: params.createdById,
      title: params.title,
    });
    return result.request;
  }

  const org = await prisma.organisation.findUnique({ where: { id: params.organisationId } });
  if (!org) throw httpError("Organisation not found", 404, "NOT_FOUND");

  if (!params.file) {
    throw httpError("Upload a PDF or choose a document", 400, "VALIDATION_ERROR");
  }

  const isPdf =
    params.file.mimetype.includes("pdf") ||
    params.file.originalname.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    throw httpError("E-sign requires a PDF file", 400, "VALIDATION_ERROR");
  }

  const sourceFileName = params.file.originalname;
  const safeName = `${Date.now()}_${sourceFileName.replace(/[^\w.\-]+/g, "_")}`;
  const sourceStoragePath = await writeStoredFile(
    path.join("signatures", params.organisationId, "source"),
    safeName,
    params.file.buffer
  );

  return prisma.signatureRequest.create({
    data: {
      organisationId: params.organisationId,
      title: params.title.trim(),
      status: SignatureStatus.draft,
      sourceDocumentId: params.sourceDocumentId || null,
      sourceFileName,
      sourceMimeType: params.file.mimetype || "application/pdf",
      sourceStoragePath,
      sourceSizeBytes: params.file.size,
      createdById: params.createdById,
      sentAt: null,
    },
    include: requestInclude,
  });
}

export async function replaceFields(params: {
  id: string;
  fields: FieldInput[];
}) {
  const existing = await prisma.signatureRequest.findUnique({ where: { id: params.id } });
  if (!existing) throw httpError("Signature request not found", 404, "NOT_FOUND");
  if (!canEditFields(existing.status)) {
    throw httpError("Fields cannot be edited in this status", 409, "INVALID_STATUS");
  }

  for (const f of params.fields) {
    if (f.page < 1 || f.width <= 0 || f.height <= 0) {
      throw httpError("Invalid field geometry", 400, "VALIDATION_ERROR");
    }
    if (f.x < 0 || f.y < 0 || f.x + f.width > 1.01 || f.y + f.height > 1.01) {
      throw httpError("Field coordinates must be normalized 0–1 within the page", 400, "VALIDATION_ERROR");
    }
    parseFieldType(f.type);
  }

  const assigneeIds = params.fields
    .map((f) => f.assigneeUserId)
    .filter((id): id is string => Boolean(id));
  await assertValidAssignees(existing.organisationId, assigneeIds);

  await prisma.$transaction(async (tx) => {
    await tx.signatureField.deleteMany({ where: { requestId: existing.id } });
    if (params.fields.length > 0) {
      await tx.signatureField.createMany({
        data: params.fields.map((f, i) => {
          const type = parseFieldType(f.type);
          return {
            requestId: existing.id,
            type,
            page: f.page,
            x: f.x,
            y: f.y,
            width: f.width,
            height: f.height,
            label: f.label?.trim() || defaultLabelForType(type),
            required: f.required !== false,
            sortOrder: f.sortOrder ?? i,
            assigneeUserId: f.assigneeUserId || null,
          };
        }),
      });
    }
  });

  return getSignatureRequestById(existing.id);
}

/** Unlock field placement again (clears any early ink). */
export async function reopenForEdit(id: string) {
  const existing = await getSignatureRequestById(id);
  if (!existing) throw httpError("Signature request not found", 404, "NOT_FOUND");
  if (existing.status !== SignatureStatus.ready_for_send) {
    throw httpError("Only ready requests can be reopened for editing", 409, "INVALID_STATUS");
  }

  await prisma.signatureField.updateMany({
    where: { requestId: existing.id },
    data: {
      signedImagePath: null,
      signedAt: null,
      valueText: null,
      signedByUserId: null,
    },
  });

  return prisma.signatureRequest.update({
    where: { id },
    data: {
      status: SignatureStatus.draft,
      typedName: null,
      agreedAt: null,
      signedAt: null,
      signerIp: null,
      signedById: null,
      signatureImagePath: null,
      signedStoragePath: null,
      auditStoragePath: null,
    },
    include: requestInclude,
  });
}

export async function replaceCcRecipients(params: {
  id: string;
  userIds: string[];
}) {
  const existing = await prisma.signatureRequest.findUnique({ where: { id: params.id } });
  if (!existing) throw httpError("Signature request not found", 404, "NOT_FOUND");
  if (!canEditFields(existing.status)) {
    throw httpError("CC cannot be edited in this status", 409, "INVALID_STATUS");
  }

  const unique = [...new Set(params.userIds.filter(Boolean))];
  await assertValidAssignees(existing.organisationId, unique);

  await prisma.$transaction(async (tx) => {
    await tx.signatureRequestCc.deleteMany({ where: { requestId: existing.id } });
    if (unique.length > 0) {
      await tx.signatureRequestCc.createMany({
        data: unique.map((userId) => ({
          requestId: existing.id,
          userId,
        })),
      });
    }
  });

  return getSignatureRequestById(existing.id);
}

export async function markReady(id: string) {
  const existing = await getSignatureRequestById(id);
  if (!existing) throw httpError("Signature request not found", 404, "NOT_FOUND");
  if (!canEditFields(existing.status)) {
    throw httpError("Cannot mark ready in this status", 409, "INVALID_STATUS");
  }
  if (existing.fields.length === 0) {
    throw httpError("Add at least one field before Mark Ready", 400, "VALIDATION_ERROR");
  }
  const missingAssignee = existing.fields.find((f) => !f.assigneeUserId);
  if (missingAssignee) {
    throw httpError(
      `Every field needs an assignee (missing on: ${missingAssignee.label})`,
      400,
      "VALIDATION_ERROR"
    );
  }

  return prisma.signatureRequest.update({
    where: { id },
    data: { status: SignatureStatus.ready_for_send },
    include: requestInclude,
  });
}

export async function sendForSignature(id: string) {
  const existing = await getSignatureRequestById(id);
  if (!existing) throw httpError("Signature request not found", 404, "NOT_FOUND");
  if (existing.status !== SignatureStatus.ready_for_send) {
    throw httpError("Mark Ready before sending", 409, "INVALID_STATUS");
  }
  if (existing.fields.length === 0) {
    throw httpError("At least one field is required", 400, "VALIDATION_ERROR");
  }
  const missingAssignee = existing.fields.find((f) => !f.assigneeUserId);
  if (missingAssignee) {
    throw httpError("Every field needs an assignee before Send", 400, "VALIDATION_ERROR");
  }

  const updated = await prisma.signatureRequest.update({
    where: { id },
    data: {
      status: SignatureStatus.awaiting_signature,
      sentAt: new Date(),
      revisionNote: null,
    },
    include: requestInclude,
  });

  // Notify only assignees who still have required work (skip anyone who already
  // Finished my part after Mark Ready). CC always get one notify on Send.
  const pendingAssigneeIds = [
    ...new Set(
      updated.fields
        .filter((f) => f.required && f.assigneeUserId && !fieldIsComplete(f))
        .map((f) => f.assigneeUserId as string)
    ),
  ];
  const ccIds = updated.ccRecipients.map((c) => c.userId);

  const adminAssignees = pendingAssigneeIds.filter((aid) =>
    updated.fields.some((f) => f.assigneeUserId === aid && f.assignee?.role === UserRole.admin)
  );
  const clientAssignees = pendingAssigneeIds.filter((aid) => !adminAssignees.includes(aid));
  const adminCc = ccIds.filter((cid) =>
    updated.ccRecipients.some((c) => c.userId === cid && c.user.role === UserRole.admin)
  );
  const clientCc = ccIds.filter((cid) => !adminCc.includes(cid));

  if (adminAssignees.length || adminCc.length) {
    await notifyUsers({
      userIds: [...new Set([...adminAssignees, ...adminCc])],
      organisationId: existing.organisationId,
      title: "Document ready to sign",
      body: `"${updated.title}" is awaiting signature.`,
      href: `/admin/signatures/${updated.id}`,
    });
  }
  if (clientAssignees.length || clientCc.length) {
    await notifyUsers({
      userIds: [...new Set([...clientAssignees, ...clientCc])],
      organisationId: existing.organisationId,
      title: "Document ready to sign",
      body: `"${updated.title}" is awaiting your signature.`,
      href: `/portal/signatures/${updated.id}`,
    });
  }

  try {
    const { syncPackItemFromSignatureRequest } = await import("./onboarding");
    await syncPackItemFromSignatureRequest(updated.id);
  } catch (err) {
    console.error("[onboarding:sync-pack]", err);
  }

  return updated;
}

async function completeRequestStamp(params: {
  request: NonNullable<Awaited<ReturnType<typeof getSignatureRequestById>>>;
  typedName: string;
  signedById: string;
  ip: string | null;
  now: Date;
}) {
  const { request, typedName, signedById, ip, now } = params;
  const fields = request.fields;

  const completed = fields.filter((f) => fieldIsComplete(f));
  const incompleteRequired = fields.filter((f) => f.required && !fieldIsComplete(f));
  if (incompleteRequired.length) {
    throw httpError(
      `Cannot stamp — ${incompleteRequired.length} required field(s) still incomplete`,
      409,
      "INVALID_STATUS"
    );
  }

  const stampedFields = completed
    .filter((f) => f.signedImagePath || (f.valueText && f.valueText.trim()))
    .map((f) => ({
      page: f.page,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      imageRelativePath: f.signedImagePath,
      text: f.signedImagePath ? null : f.valueText,
      label: f.label,
    }));

  if (stampedFields.length === 0) {
    throw httpError(
      "Could not stamp signatures onto the PDF — no field values to apply",
      500,
      "STAMP_FAILED"
    );
  }

  if (stampedFields.length < completed.length) {
    throw httpError(
      `Could not stamp signatures — ${completed.length - stampedFields.length} completed field(s) have no image or text`,
      500,
      "STAMP_FAILED"
    );
  }

  let signedBytes: Buffer;
  try {
    signedBytes = await stampSignaturesOnPdf(request.sourceStoragePath, stampedFields);
  } catch (err) {
    console.error("[esign:stamp-failed]", err);
    const detail = err instanceof Error ? err.message : "";
    throw httpError(
      detail
        ? `Could not stamp signatures onto the PDF. ${detail}`
        : "Could not stamp signatures onto the PDF. Please try again.",
      500,
      "STAMP_FAILED"
    );
  }

  const signedCopyName = `signed_${Date.now()}_${request.sourceFileName.replace(/[^\w.\-]+/g, "_")}`;
  const signedStoragePath = await writeStoredFile(
    path.join("signatures", request.organisationId, request.id),
    signedCopyName.endsWith(".pdf") ? signedCopyName : `${signedCopyName}.pdf`,
    signedBytes
  );

  const firstSigPath =
    fields.find((f) => f.signedImagePath)?.signedImagePath || null;

  const audit = {
    signatureRequestId: request.id,
    title: request.title,
    typedName,
    agreedAt: now.toISOString(),
    signedAt: now.toISOString(),
    signerIp: ip,
    completedById: signedById,
    fields: fields.map((f) => ({
      id: f.id,
      type: f.type,
      label: f.label,
      page: f.page,
      assigneeUserId: f.assigneeUserId,
      signedByUserId: f.signedByUserId,
      valueText: f.valueText,
      signedImagePath: f.signedImagePath,
      signedAt: f.signedAt,
    })),
    status: SignatureStatus.signed_returned,
  };
  const auditStoragePath = await writeStoredFile(
    path.join("signatures", request.organisationId, request.id),
    "audit.json",
    Buffer.from(JSON.stringify(audit, null, 2), "utf8")
  );

  const updated = await prisma.signatureRequest.update({
    where: { id: request.id },
    data: {
      status: SignatureStatus.signed_returned,
      typedName,
      agreedAt: now,
      signedAt: now,
      signerIp: ip,
      signedById,
      signatureImagePath: firstSigPath,
      signedStoragePath,
      auditStoragePath,
      revisionNote: null,
    },
    include: requestInclude,
  });

  const admins = await adminUserIds();
  await notifyUsers({
    userIds: admins,
    organisationId: request.organisationId,
    title: "Document fully signed",
    body: `"${updated.title}" was completed by all assignees.`,
    href: `/admin/signatures/${updated.id}`,
  });

  try {
    const { syncPackItemFromSignatureRequest } = await import("./onboarding");
    await syncPackItemFromSignatureRequest(updated.id);
  } catch (err) {
    console.error("[onboarding:sync-pack]", err);
  }

  return updated;
}

/**
 * Part 4.2: submit only the current user's assigned fields.
 * Completes the request (stamp + signed_returned) when all required fields are done.
 */
export async function signSignatureRequest(params: {
  id: string;
  organisationId: string;
  signedById: string;
  typedName: string;
  /** @deprecated Submit is consent — kept for API compat, ignored */
  agreed?: boolean;
  ip: string | null;
  saveToProfile?: boolean;
  /** fieldId -> PNG buffer (signature / initials / optional rendered text) */
  fieldImages: Record<string, Buffer>;
  /** fieldId -> plain text (text / date / name) */
  fieldTexts?: Record<string, string>;
  fallbackSignaturePng?: Buffer | null;
}) {
  const typedName = params.typedName.trim();
  if (typedName.length < 2) {
    throw httpError("Full name is required", 400, "VALIDATION_ERROR");
  }

  const existing = await getSignatureRequestById(params.id);
  if (!existing || existing.organisationId !== params.organisationId) {
    throw httpError("Signature request not found", 404, "NOT_FOUND");
  }
  if (!canFill(existing.status)) {
    throw httpError(
      "Mark Ready before signing (or wait until the request is sent)",
      409,
      "INVALID_STATUS"
    );
  }

  const myFields = existing.fields.filter((f) => f.assigneeUserId === params.signedById);
  if (myFields.length === 0) {
    throw httpError("You have no fields to fill on this request", 403, "FORBIDDEN");
  }

  const alreadyDone = myFields.every((f) => fieldIsComplete(f));
  if (alreadyDone) {
    throw httpError("You have already completed your fields", 409, "ALREADY_SIGNED");
  }

  const fieldTexts = params.fieldTexts || {};
  const now = new Date();
  let firstSigPath: string | null = null;

  for (const f of myFields) {
    if (fieldIsComplete(f) && f.required) continue;

    const img = params.fieldImages[f.id] || (INK_TYPES.includes(f.type) ? params.fallbackSignaturePng : null);
    let text = (fieldTexts[f.id] || "").trim();

    if (f.type === SignatureFieldType.date && !text && !img) {
      text = now.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }
    if (f.type === SignatureFieldType.name && !text) {
      text = typedName;
    }

    if (INK_TYPES.includes(f.type)) {
      if (!img && f.required) {
        throw httpError(`Missing signature for field: ${f.label}`, 400, "VALIDATION_ERROR");
      }
      if (!img) continue;
      const rel = await writeStoredFile(
        path.join("signatures", params.organisationId, params.id, "fields"),
        `${f.id}_${Date.now()}.png`,
        img
      );
      if (!firstSigPath) firstSigPath = rel;
      await prisma.signatureField.update({
        where: { id: f.id },
        data: {
          signedImagePath: rel,
          valueText: null,
          signedByUserId: params.signedById,
          signedAt: now,
        },
      });
      continue;
    }

    // text / date / name
    if (!text && !img && f.required) {
      throw httpError(`Missing value for field: ${f.label}`, 400, "VALIDATION_ERROR");
    }
    if (!text && !img) continue;

    let imagePath: string | null = null;
    if (img) {
      imagePath = await writeStoredFile(
        path.join("signatures", params.organisationId, params.id, "fields"),
        `${f.id}_${Date.now()}.png`,
        img
      );
      if (!firstSigPath) firstSigPath = imagePath;
    }

    await prisma.signatureField.update({
      where: { id: f.id },
      data: {
        signedImagePath: imagePath,
        valueText: text || null,
        signedByUserId: params.signedById,
        signedAt: now,
      },
    });
  }

  if (params.saveToProfile && firstSigPath) {
    try {
      const { addProfileSignature } = await import("./profileSignatures");
      const bytes = await fs.readFile(absoluteStoragePath(firstSigPath));
      await addProfileSignature({
        userId: params.signedById,
        buffer: bytes,
        originalName: "signature.png",
        mimeType: "image/png",
      });
    } catch (err) {
      console.error("[esign:save-to-profile]", err);
    }
  }

  const refreshed = await getSignatureRequestById(params.id);
  if (!refreshed) throw httpError("Signature request not found", 404, "NOT_FOUND");

  const allDone =
    refreshed.fields.length > 0 &&
    (refreshed.fields.filter((f) => f.required).length
      ? refreshed.fields.filter((f) => f.required).every((f) => fieldIsComplete(f))
      : refreshed.fields.every((f) => fieldIsComplete(f)));

  // Hold notifications: assignees already got “ready to sign” on Send.
  // Do not re-ping waiters every time another person finishes their part.
  if (!allDone) {
    return refreshed;
  }

  try {
    return await completeRequestStamp({
      request: refreshed,
      typedName,
      signedById: params.signedById,
      ip: params.ip,
      now,
    });
  } catch (err) {
    const e = err as { status?: number; code?: string };
    if (e.status && e.code) throw err;
    console.error("[esign:stamp-failed]", err);
    throw httpError(
      "Could not stamp signatures onto the PDF. Please try again.",
      500,
      "STAMP_FAILED"
    );
  }
}

function formatSignedLibraryName(params: {
  baseTitle: string;
  signerName: string;
  signedAt: Date;
}) {
  const day = params.signedAt.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const safeSigner = params.signerName.replace(/[^\w .\-']/g, "").trim() || "Client";
  const safeBase = params.baseTitle.replace(/\.pdf$/i, "").trim() || "Document";
  return `${safeBase} — Signed — ${safeSigner} — ${day}`;
}

/** Publish stamped PDF into Documents folder as a new file (keep unsigned original). */
async function publishSignedPdfToDocuments(params: {
  request: {
    id: string;
    organisationId: string;
    title: string;
    sourceDocumentId: string | null;
    signedStoragePath: string | null;
    typedName: string | null;
    signedAt: Date | null;
  };
  reviewedById: string;
}) {
  if (!params.request.signedStoragePath) {
    throw httpError("No signed PDF to publish", 400, "VALIDATION_ERROR");
  }

  let folderId: string | null = null;
  if (params.request.sourceDocumentId) {
    const source = await prisma.document.findFirst({
      where: {
        id: params.request.sourceDocumentId,
        organisationId: params.request.organisationId,
      },
      select: { folderId: true, title: true },
    });
    folderId = source?.folderId || null;
  }
  if (!folderId) {
    const fallback = await prisma.documentFolder.findFirst({
      where: { organisationId: params.request.organisationId },
      orderBy: { sortOrder: "asc" },
    });
    folderId = fallback?.id || null;
  }
  if (!folderId) {
    throw httpError("No document folder available to publish signed copy", 400, "VALIDATION_ERROR");
  }

  const signedAt = params.request.signedAt || new Date();
  const signerName = params.request.typedName || "Client";
  const libraryTitle = formatSignedLibraryName({
    baseTitle: params.request.title,
    signerName,
    signedAt,
  });
  const fileName = `${libraryTitle.replace(/[^\w .\-—–']/g, "_")}.pdf`;

  const bytes = await fs.readFile(absoluteStoragePath(params.request.signedStoragePath));
  const published = await uploadDocument({
    organisationId: params.request.organisationId,
    folderId,
    userId: params.reviewedById,
    title: libraryTitle,
    isSignedCopy: true,
    signatureRequestId: params.request.id,
    file: {
      originalName: fileName,
      mimeType: "application/pdf",
      size: bytes.length,
      buffer: bytes,
    },
  });

  if (published.error) {
    throw httpError(published.error.message, published.error.status, published.error.code);
  }

  return published;
}

export async function reviewSignatureRequest(params: {
  id: string;
  reviewedById: string;
}) {
  const existing = await prisma.signatureRequest.findUnique({ where: { id: params.id } });
  if (!existing) throw httpError("Signature request not found", 404, "NOT_FOUND");
  if (existing.status !== SignatureStatus.signed_returned) {
    throw httpError("Only signed requests can be reviewed", 409, "INVALID_STATUS");
  }

  const published = await publishSignedPdfToDocuments({
    request: existing,
    reviewedById: params.reviewedById,
  });

  const updated = await prisma.signatureRequest.update({
    where: { id: existing.id },
    data: {
      status: SignatureStatus.reviewed,
      reviewedAt: new Date(),
      reviewedById: params.reviewedById,
    },
    include: requestInclude,
  });

  // One “marked complete” notify — clients only (admins already got “fully signed”).
  // Skip the admin who pressed Complete. Correct portal href for clients.
  const assigneeUsers = await prisma.user.findMany({
    where: {
      id: {
        in: (
          await prisma.signatureField.findMany({
            where: { requestId: existing.id, assigneeUserId: { not: null } },
            select: { assigneeUserId: true },
            distinct: ["assigneeUserId"],
          })
        )
          .map((f) => f.assigneeUserId)
          .filter((id): id is string => Boolean(id)),
      },
    },
    select: { id: true, role: true },
  });
  const clientAssignees = assigneeUsers
    .filter((u) => u.role === UserRole.client && u.id !== params.reviewedById)
    .map((u) => u.id);

  if (clientAssignees.length) {
    await notifyUsers({
      userIds: clientAssignees,
      organisationId: existing.organisationId,
      title: "Signature reviewed",
      body: `"${updated.title}" has been marked complete. A signed copy is now in Documents.`,
      href: `/portal/signatures/${updated.id}`,
    });
  }

  try {
    const { syncPackItemFromSignatureRequest } = await import("./onboarding");
    await syncPackItemFromSignatureRequest(updated.id);
  } catch (err) {
    console.error("[onboarding:sync-pack]", err);
  }

  const publishedDoc = "document" in published ? published.document : null;
  return {
    request: updated,
    published: publishedDoc
      ? {
          documentId: publishedDoc.id,
          title: publishedDoc.title,
          folderId: publishedDoc.folderId,
        }
      : null,
  };
}

export async function requestRevision(params: {
  id: string;
  note?: string;
}) {
  const existing = await getSignatureRequestById(params.id);
  if (!existing) throw httpError("Signature request not found", 404, "NOT_FOUND");
  if (existing.status !== SignatureStatus.signed_returned) {
    throw httpError("Only signed requests can be sent for revision", 409, "INVALID_STATUS");
  }

  await prisma.signatureField.updateMany({
    where: { requestId: existing.id },
    data: {
      signedImagePath: null,
      signedAt: null,
      valueText: null,
      signedByUserId: null,
    },
  });

  const updated = await prisma.signatureRequest.update({
    where: { id: existing.id },
    data: {
      status: SignatureStatus.revision_requested,
      revisionNote: params.note?.trim() || "Revision requested — please sign again",
      typedName: null,
      agreedAt: null,
      signedAt: null,
      signerIp: null,
      signedById: null,
      signatureImagePath: null,
      signedStoragePath: null,
      auditStoragePath: null,
      sentAt: existing.sentAt || new Date(),
    },
    include: requestInclude,
  });

  const assigneeIds = [
    ...new Set(
      updated.fields
        .map((f) => f.assigneeUserId)
        .filter((uid): uid is string => Boolean(uid))
    ),
  ];
  const assigneeUsers = await prisma.user.findMany({
    where: { id: { in: assigneeIds } },
    select: { id: true, role: true },
  });
  const adminAssignees = assigneeUsers
    .filter((u) => u.role === UserRole.admin)
    .map((u) => u.id);
  const clientAssignees = assigneeUsers
    .filter((u) => u.role === UserRole.client)
    .map((u) => u.id);
  const body = `"${updated.title}" needs to be signed again.${
    params.note ? ` Note: ${params.note}` : ""
  }`;
  if (adminAssignees.length) {
    await notifyUsers({
      userIds: adminAssignees,
      organisationId: existing.organisationId,
      title: "Signature revision requested",
      body,
      href: `/admin/signatures/${updated.id}`,
    });
  }
  if (clientAssignees.length) {
    await notifyUsers({
      userIds: clientAssignees,
      organisationId: existing.organisationId,
      title: "Signature revision requested",
      body,
      href: `/portal/signatures/${updated.id}`,
    });
  }

  return updated;
}

export async function reuploadSignedCopy(params: {
  id: string;
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number };
  uploadedById: string;
}) {
  const existing = await prisma.signatureRequest.findUnique({ where: { id: params.id } });
  if (!existing) throw httpError("Signature request not found", 404, "NOT_FOUND");

  const safeName = `manual_${Date.now()}_${params.file.originalname.replace(/[^\w.\-]+/g, "_")}`;
  const signedStoragePath = await writeStoredFile(
    path.join("signatures", existing.organisationId, existing.id),
    safeName,
    params.file.buffer
  );

  return prisma.signatureRequest.update({
    where: { id: existing.id },
    data: {
      signedStoragePath,
      status:
        existing.status === SignatureStatus.reviewed
          ? SignatureStatus.reviewed
          : SignatureStatus.signed_returned,
      signedAt: existing.signedAt || new Date(),
    },
    include: requestInclude,
  });
}
