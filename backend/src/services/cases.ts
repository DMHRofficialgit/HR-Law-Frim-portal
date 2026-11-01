import path from "path";
import { CaseStatus, MessageVisibility } from "@prisma/client";
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

export function filterCaseForClient<T extends { messages: Array<{ visibility: MessageVisibility }> }>(
  c: T
) {
  return {
    ...c,
    messages: c.messages.filter((m) => m.visibility === MessageVisibility.client_visible),
  };
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
  employeeId: string;
  files?: Array<{ originalName: string; mimeType: string; size: number; buffer: Buffer }>;
}) {
  const category = await prisma.caseCategory.findFirst({
    where: { id: params.categoryId, active: true },
  });
  if (!category) {
    return { error: { status: 400, code: "VALIDATION_ERROR", message: "Invalid category" } };
  }

  const employee = await prisma.employee.findFirst({
    where: { id: params.employeeId, organisationId: params.organisationId },
  });
  if (!employee) {
    return {
      error: { status: 400, code: "VALIDATION_ERROR", message: "Related employee is required and must belong to this organisation" },
    };
  }

  for (const file of params.files || []) {
    const v = await validateCaseFile(file);
    if (!v.ok) return { error: { status: 400, code: "UPLOAD_REJECTED", message: v.message } };
  }

  const ref = await nextCaseRef();
  const created = await prisma.case.create({
    data: {
      ref,
      organisationId: params.organisationId,
      title: params.title,
      description: params.description,
      categoryId: params.categoryId,
      employeeId: params.employeeId,
      createdById: params.userId,
      status: CaseStatus.submitted,
      messages: {
        create: {
          authorId: params.userId,
          visibility: MessageVisibility.client_visible,
          body: "Case submitted.",
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
  const admins = await adminUserIds();
  await notifyUsers({
    userIds: admins,
    organisationId: params.organisationId,
    title: "New employment case submitted",
    body: `${ref}: ${params.title}`,
    href: `/admin/cases/${created.id}`,
  });

  return { case: full };
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
  await notifyUsers({
    userIds: clients,
    organisationId: existing.organisationId,
    title: "Case status updated",
    body: `${existing.ref}: ${params.status.replace(/_/g, " ")}`,
    href: `/portal/cases/${existing.id}`,
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
      });
    } else {
      const admins = await adminUserIds();
      await notifyUsers({
        userIds: admins,
        organisationId: existing.organisationId,
        title: "Client replied on case",
        body: `${existing.ref}: ${params.body.slice(0, 120)}`,
        href: `/admin/cases/${existing.id}`,
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

export async function deleteCase(caseId: string, organisationId?: string) {
  const existing = await getCase(caseId, organisationId);
  if (!existing) return null;

  for (const att of existing.attachments) {
    await removeStoredFile(att.storagePath);
  }
  await prisma.case.delete({ where: { id: caseId } });
  return existing;
}
