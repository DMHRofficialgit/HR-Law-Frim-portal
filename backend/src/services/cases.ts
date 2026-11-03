import path from "path";
import { CaseStatus, MessageVisibility } from "@prisma/client";
import { isOtherCaseCategoryName } from "../lib/caseCategories";
import { nextCaseRef } from "../lib/caseRef";
import {
  adminUserIds,
  clientUserIdsForOrg,
  notifyUsers,
} from "../lib/notifications";
import { prisma } from "../lib/prisma";
import { removeStoredFile, writeStoredFile } from "../lib/storage";
import { extensionOf, getUploadSettings } from "../lib/uploadSettings";

const caseInclude = {
  category: true,
  employee: true,
  organisation: { select: { id: true, name: true, ref: true } },
  createdBy: { select: { id: true, name: true, email: true, role: true } },
  messages: {
    orderBy: { createdAt: "asc" as const },
    include: {
      author: { select: { id: true, name: true, email: true, role: true } },
    },
  },
  attachments: {
    orderBy: { createdAt: "asc" as const },
    include: {
      uploadedBy: { select: { id: true, name: true, email: true } },
    },
  },
};

export async function listCases(organisationId?: string) {
  return prisma.case.findMany({
    where: organisationId ? { organisationId } : undefined,
    orderBy: { updatedAt: "desc" },
    include: {
      category: true,
      employee: true,
      organisation: { select: { id: true, name: true, ref: true } },
      _count: { select: { messages: true, attachments: true } },
    },
  });
}

export async function getCase(id: string, organisationId?: string) {
  return prisma.case.findFirst({
    where: {
      id,
      ...(organisationId ? { organisationId } : {}),
    },
    include: caseInclude,
  });
}

type ClientFilterableCase = {
  messages: Array<{ id: string; visibility: MessageVisibility }>;
  attachments?: Array<{ messageId?: string | null }>;
};

/** Strip admin-only messages and any files attached to those private notes. */
export function filterCaseForClient<T extends ClientFilterableCase>(c: T) {
  const visibleMessages = c.messages.filter(
    (m) => m.visibility === MessageVisibility.client_visible
  );
  const privateMessageIds = new Set(
    c.messages
      .filter((m) => m.visibility === MessageVisibility.admin_only)
      .map((m) => m.id)
  );
  const attachments = (c.attachments || []).filter(
    (a) => !a.messageId || !privateMessageIds.has(a.messageId)
  );
  return {
    ...c,
    messages: visibleMessages,
    attachments,
  };
}

/** True when a client in this org may download/preview the attachment. */
export async function isCaseAttachmentClientVisible(
  attachmentId: string,
  organisationId: string
): Promise<boolean> {
  const att = await prisma.caseAttachment.findFirst({
    where: {
      id: attachmentId,
      case: { organisationId },
    },
    select: { id: true, messageId: true },
  });
  if (!att) return false;
  if (!att.messageId) return true;
  const msg = await prisma.caseMessage.findFirst({
    where: { id: att.messageId },
    select: { visibility: true },
  });
  if (!msg) return true;
  return msg.visibility === MessageVisibility.client_visible;
}

async function validateCaseFile(file: {
  originalName: string;
  mimeType: string;
  size: number;
}) {
  const settings = await getUploadSettings();
  const ext = extensionOf(file.originalName);
  if (!ext || !settings.allowedExtensions.map((e) => e.toLowerCase()).includes(ext)) {
    return { ok: false as const, message: `File type .${ext || "unknown"} is not allowed` };
  }
  if (file.size > settings.maxUploadBytes) {
    return { ok: false as const, message: `File exceeds max size of ${settings.maxUploadBytes} bytes` };
  }
  return { ok: true as const };
}

export async function createCase(params: {
  organisationId: string;
  userId: string;
  title: string;
  description: string;
  categoryId: string;
  categoryOther?: string | null;
  employeeId?: string | null;
  peopleInvolved?: string | null;
  investigation?: string | null;
  outcome?: string | null;
  createdByRole?: "admin" | "client";
  files?: Array<{ originalName: string; mimeType: string; size: number; buffer: Buffer }>;
}) {
  const category = await prisma.caseCategory.findFirst({
    where: { id: params.categoryId, active: true },
  });
  if (!category) {
    return { error: { status: 400, code: "VALIDATION_ERROR", message: "Invalid category" } };
  }

  const org = await prisma.organisation.findUnique({ where: { id: params.organisationId } });
  if (!org) {
    return { error: { status: 400, code: "VALIDATION_ERROR", message: "Organisation not found" } };
  }

  const otherSelected = isOtherCaseCategoryName(category.name);
  const categoryOther = params.categoryOther?.trim() || null;
  if (otherSelected && !categoryOther) {
    return {
      error: {
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Specify the category when Other is selected",
      },
    };
  }

  const employeeId = params.employeeId?.trim() || null;
  if (employeeId) {
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, organisationId: params.organisationId },
    });
    if (!employee) {
      return {
        error: {
          status: 400,
          code: "VALIDATION_ERROR",
          message: "Related employee must belong to this organisation",
        },
      };
    }
  }

  for (const file of params.files || []) {
    const v = await validateCaseFile(file);
    if (!v.ok) return { error: { status: 400, code: "UPLOAD_REJECTED", message: v.message } };
  }

  const byAdmin = params.createdByRole === "admin";
  const openBody = byAdmin
    ? "Case opened by DM.HR Group."
    : "Case submitted.";

  const ref = await nextCaseRef();
  const created = await prisma.case.create({
    data: {
      ref,
      organisationId: params.organisationId,
      title: params.title.trim(),
      description: params.description.trim(),
      peopleInvolved: params.peopleInvolved?.trim() || null,
      investigation: params.investigation?.trim() || null,
      outcome: params.outcome?.trim() || null,
      categoryId: params.categoryId,
      categoryOther: otherSelected ? categoryOther : null,
      employeeId,
      createdById: params.userId,
      status: CaseStatus.submitted,
      messages: {
        create: {
          authorId: params.userId,
          visibility: MessageVisibility.client_visible,
          body: openBody,
        },
      },
    },
  });

  for (const file of params.files || []) {
    const safeName = path.basename(file.originalName).replace(/[^\w.\- ()[\]]+/g, "_") || "file";
    const stored = await writeStoredFile(
      path.join(params.organisationId, "cases", created.id),
      `${Date.now()}_${safeName}`,
      file.buffer
    );
    await prisma.caseAttachment.create({
      data: {
        caseId: created.id,
        fileName: safeName,
        mimeType: file.mimeType || "application/octet-stream",
        sizeBytes: file.size,
        storagePath: stored,
        uploadedById: params.userId,
      },
    });
  }

  const full = await getCase(created.id);

  if (byAdmin) {
    const clients = await clientUserIdsForOrg(params.organisationId);
    await notifyUsers({
      userIds: clients,
      organisationId: params.organisationId,
      title: "New employment case opened",
      body: `${ref}: ${params.title.trim()}`,
      href: `/portal/cases/${created.id}`,
      emailGroup: "cases",
      templateKey: "case_opened_client",
      tokens: { case_ref: ref, case_title: params.title.trim() },
    });
  } else {
    const admins = await adminUserIds();
    await notifyUsers({
      userIds: admins,
      organisationId: params.organisationId,
      title: "New employment case submitted",
      body: `${ref}: ${params.title.trim()}`,
      href: `/admin/cases/${created.id}`,
      emailGroup: "cases",
      templateKey: "case_opened_admin",
      tokens: { case_ref: ref, case_title: params.title.trim() },
    });
  }

  return { case: full };
}

export async function updateCase(params: {
  caseId: string;
  organisationId?: string;
  title?: string;
  description?: string;
  categoryId?: string;
  categoryOther?: string | null;
  employeeId?: string | null;
  peopleInvolved?: string | null;
  investigation?: string | null;
  outcome?: string | null;
}) {
  const existing = await getCase(params.caseId, params.organisationId);
  if (!existing) {
    return { error: { status: 404, code: "NOT_FOUND", message: "Case not found" } };
  }

  let nextCategory = existing.category;
  if (params.categoryId) {
    const category = await prisma.caseCategory.findFirst({
      where: { id: params.categoryId, active: true },
    });
    if (!category) {
      return { error: { status: 400, code: "VALIDATION_ERROR", message: "Invalid category" } };
    }
    nextCategory = category;
  }

  const otherSelected = isOtherCaseCategoryName(nextCategory.name);
  const categoryOtherIncoming =
    params.categoryOther !== undefined
      ? params.categoryOther?.trim() || null
      : existing.categoryOther;
  if (otherSelected && params.categoryId !== undefined && !categoryOtherIncoming) {
    return {
      error: {
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Specify the category when Other is selected",
      },
    };
  }
  if (
    otherSelected &&
    params.categoryOther !== undefined &&
    !categoryOtherIncoming
  ) {
    return {
      error: {
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Specify the category when Other is selected",
      },
    };
  }

  if (params.employeeId) {
    const employee = await prisma.employee.findFirst({
      where: { id: params.employeeId, organisationId: existing.organisationId },
    });
    if (!employee) {
      return {
        error: {
          status: 400,
          code: "VALIDATION_ERROR",
          message: "Related employee must belong to this organisation",
        },
      };
    }
  }

  const data: {
    title?: string;
    description?: string;
    categoryId?: string;
    categoryOther?: string | null;
    employeeId?: string | null;
    peopleInvolved?: string | null;
    investigation?: string | null;
    outcome?: string | null;
  } = {};

  if (params.title !== undefined) data.title = params.title.trim();
  if (params.description !== undefined) data.description = params.description.trim();
  if (params.categoryId !== undefined) data.categoryId = params.categoryId;
  if (params.categoryId !== undefined || params.categoryOther !== undefined) {
    data.categoryOther = otherSelected ? categoryOtherIncoming : null;
  }
  if (params.employeeId !== undefined) {
    data.employeeId = params.employeeId?.trim() || null;
  }
  if (params.peopleInvolved !== undefined) {
    data.peopleInvolved = params.peopleInvolved?.trim() || null;
  }
  if (params.investigation !== undefined) {
    data.investigation = params.investigation?.trim() || null;
  }
  if (params.outcome !== undefined) {
    data.outcome = params.outcome?.trim() || null;
  }

  await prisma.case.update({ where: { id: params.caseId }, data });
  const updated = await getCase(params.caseId);
  return { case: updated };
}

export async function updateCaseStatus(params: {
  caseId: string;
  status: CaseStatus;
  actorUserId: string;
  organisationId?: string;
}) {
  const existing = await getCase(params.caseId, params.organisationId);
  if (!existing) return { error: { status: 404, code: "NOT_FOUND", message: "Case not found" } };

  await prisma.$transaction(async (tx) => {
    await tx.case.update({
      where: { id: params.caseId },
      data: { status: params.status },
    });
    await tx.caseMessage.create({
      data: {
        caseId: params.caseId,
        authorId: params.actorUserId,
        visibility: MessageVisibility.client_visible,
        body: `Status updated to ${params.status.replace(/_/g, " ")}.`,
      },
    });
  });

  // Fetch after commit so the new thread message is included
  const updated = await getCase(params.caseId);

  const clients = await clientUserIdsForOrg(existing.organisationId);
  const statusLabel = params.status.replace(/_/g, " ");
  await notifyUsers({
    userIds: clients,
    organisationId: existing.organisationId,
    title: "Case status updated",
    body: `${existing.ref}: ${statusLabel}`,
    href: `/portal/cases/${existing.id}`,
    emailGroup: "cases",
    templateKey: "case_status_updated",
    tokens: { case_ref: existing.ref, status: statusLabel },
  });

  return { case: updated };
}

export async function addCaseMessage(params: {
  caseId: string;
  organisationId?: string;
  userId: string;
  body: string;
  visibility: MessageVisibility;
  files?: Array<{ originalName: string; mimeType: string; size: number; buffer: Buffer }>;
}) {
  const existing = await getCase(params.caseId, params.organisationId);
  if (!existing) return { error: { status: 404, code: "NOT_FOUND", message: "Case not found" } };

  for (const file of params.files || []) {
    const v = await validateCaseFile(file);
    if (!v.ok) return { error: { status: 400, code: "UPLOAD_REJECTED", message: v.message } };
  }

  const message = await prisma.caseMessage.create({
    data: {
      caseId: params.caseId,
      authorId: params.userId,
      visibility: params.visibility,
      body: params.body,
    },
  });

  for (const file of params.files || []) {
    const safeName = path.basename(file.originalName).replace(/[^\w.\- ()[\]]+/g, "_") || "file";
    const stored = await writeStoredFile(
      path.join(existing.organisationId, "cases", existing.id),
      `${Date.now()}_${safeName}`,
      file.buffer
    );
    await prisma.caseAttachment.create({
      data: {
        caseId: existing.id,
        messageId: message.id,
        fileName: safeName,
        mimeType: file.mimeType || "application/octet-stream",
        sizeBytes: file.size,
        storagePath: stored,
        uploadedById: params.userId,
      },
    });
  }

  await prisma.case.update({
    where: { id: existing.id },
    data: { updatedAt: new Date() },
  });

  const full = await getCase(existing.id);

  if (params.visibility === MessageVisibility.client_visible) {
    const author = await prisma.user.findUnique({ where: { id: params.userId } });
    if (author?.role === "admin") {
      const clients = await clientUserIdsForOrg(existing.organisationId);
      await notifyUsers({
        userIds: clients,
        organisationId: existing.organisationId,
        title: "Case update",
        body: `${existing.ref}: new update from DMHR`,
        href: `/portal/cases/${existing.id}`,
        emailGroup: "cases",
        templateKey: "case_update",
        tokens: { case_ref: existing.ref },
      });
    } else {
      const admins = await adminUserIds();
      const replyPreview = params.body.slice(0, 120);
      await notifyUsers({
        userIds: admins,
        organisationId: existing.organisationId,
        title: "Client replied on case",
        body: `${existing.ref}: ${replyPreview}`,
        href: `/admin/cases/${existing.id}`,
        emailGroup: "cases",
        templateKey: "case_client_reply",
        tokens: { case_ref: existing.ref, detail: replyPreview },
      });
    }
  }

  return { case: full };
}

export async function getCaseAttachment(attachmentId: string, organisationId?: string) {
  return prisma.caseAttachment.findFirst({
    where: {
      id: attachmentId,
      ...(organisationId ? { case: { organisationId } } : {}),
    },
    include: { case: { select: { id: true, organisationId: true, ref: true } } },
  });
}

/**
 * Remove one case file from disk + DB.
 * - Admin: any attachment (pass organisationId undefined).
 * - Client: must pass organisationId + uploadedById; only own uploads.
 */
export async function deleteCaseAttachment(
  attachmentId: string,
  opts?: { organisationId?: string; uploadedById?: string }
) {
  const att = await prisma.caseAttachment.findFirst({
    where: {
      id: attachmentId,
      ...(opts?.organisationId ? { case: { organisationId: opts.organisationId } } : {}),
      ...(opts?.uploadedById ? { uploadedById: opts.uploadedById } : {}),
    },
  });
  if (!att) return null;

  await removeStoredFile(att.storagePath);
  await prisma.caseAttachment.delete({ where: { id: att.id } });
  return att;
}

export async function deleteCase(caseId: string, organisationId?: string) {
  const existing = await getCase(caseId, organisationId);
  if (!existing) return null;

  for (const att of existing.attachments) {
    await removeStoredFile(att.storagePath);
  }
  await prisma.case.delete({ where: { id: caseId } });
  return existing;
}
