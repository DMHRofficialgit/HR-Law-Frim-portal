import path from "path";
import { prisma } from "../lib/prisma";
import { removeStoredFile, writeStoredFile } from "../lib/storage";
import { extensionOf, getUploadSettings } from "../lib/uploadSettings";

export type UploadedFileInput = {
  originalName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
};

function sanitizeBaseName(fileName: string) {
  const base = path.basename(fileName).replace(/[^\w.\- ()[\]]+/g, "_").trim();
  return base || "document";
}

export async function listFolders(organisationId: string) {
  return prisma.documentFolder.findMany({
    where: { organisationId },
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { documents: true } },
    },
  });
}

export async function listDocuments(organisationId: string, folderId: string) {
  const folder = await prisma.documentFolder.findFirst({
    where: { id: folderId, organisationId },
  });
  if (!folder) return null;

  const documents = await prisma.document.findMany({
    where: { folderId, organisationId },
    orderBy: { updatedAt: "desc" },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  return { folder, documents };
}

export async function assertFolderAccess(organisationId: string, folderId: string) {
  return prisma.documentFolder.findFirst({
    where: { id: folderId, organisationId },
  });
}

export async function getDocumentForOrg(organisationId: string, documentId: string) {
  return prisma.document.findFirst({
    where: { id: documentId, organisationId },
    include: {
      folder: true,
      versions: { orderBy: { versionNumber: "desc" } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function validateUpload(file: UploadedFileInput) {
  const settings = await getUploadSettings();
  const ext = extensionOf(file.originalName);

  if (!ext || !settings.allowedExtensions.map((e) => e.toLowerCase()).includes(ext)) {
    return {
      ok: false as const,
      message: `File type .${ext || "unknown"} is not allowed`,
    };
  }

  if (
    settings.allowedMimeTypes.length > 0 &&
    file.mimeType &&
    !settings.allowedMimeTypes.includes(file.mimeType)
  ) {
    // Some browsers send empty/octet-stream — allow if extension is OK and mime is generic
    const generic = ["application/octet-stream", "binary/octet-stream", ""];
    if (!generic.includes(file.mimeType)) {
      return {
        ok: false as const,
        message: `MIME type ${file.mimeType} is not allowed`,
      };
    }
  }

  if (file.size > settings.maxUploadBytes) {
    return {
      ok: false as const,
      message: `File exceeds max size of ${settings.maxUploadBytes} bytes`,
    };
  }

  if (file.size <= 0) {
    return { ok: false as const, message: "Empty file" };
  }

  return { ok: true as const, settings };
}

export async function uploadDocument(params: {
  organisationId: string;
  folderId: string;
  userId: string;
  file: UploadedFileInput;
  documentId?: string;
  /** Override display title (e.g. signed library name with em dashes). */
  title?: string;
  isSignedCopy?: boolean;
  signatureRequestId?: string | null;
}) {
  const folder = await assertFolderAccess(params.organisationId, params.folderId);
  if (!folder) {
    return { error: { status: 404, code: "NOT_FOUND", message: "Folder not found" } };
  }

  const validation = await validateUpload(params.file);
  if (!validation.ok) {
    return {
      error: { status: 400, code: "UPLOAD_REJECTED", message: validation.message },
    };
  }

  const safeName = sanitizeBaseName(params.file.originalName);
  const title =
    (params.title || "").trim() ||
    safeName.replace(/\.[^.]+$/, "") ||
    safeName;
  const isSignedCopy = Boolean(params.isSignedCopy);
  const signatureRequestId = params.signatureRequestId || null;

  let document = params.documentId
    ? await prisma.document.findFirst({
        where: {
          id: params.documentId,
          organisationId: params.organisationId,
          folderId: params.folderId,
        },
      })
    : await prisma.document.findFirst({
        where: {
          organisationId: params.organisationId,
          folderId: params.folderId,
          title,
        },
      });

  if (params.documentId && !document) {
    return { error: { status: 404, code: "NOT_FOUND", message: "Document not found" } };
  }

  if (!document) {
    document = await prisma.document.create({
      data: {
        organisationId: params.organisationId,
        folderId: params.folderId,
        title,
        currentVersion: 0,
        createdById: params.userId,
        isSignedCopy,
        signatureRequestId,
      },
    });
  }

  const nextVersion = document.currentVersion + 1;
  const storedFileName = `${document.id}_v${nextVersion}_${Date.now()}_${safeName}`;
  const relativePath = await writeStoredFile(
    path.join(params.organisationId, folder.id),
    storedFileName,
    params.file.buffer
  );

  const [version] = await prisma.$transaction([
    prisma.documentVersion.create({
      data: {
        documentId: document.id,
        versionNumber: nextVersion,
        fileName: safeName,
        mimeType: params.file.mimeType || "application/octet-stream",
        sizeBytes: params.file.size,
        storagePath: relativePath,
        uploadedById: params.userId,
      },
    }),
    prisma.document.update({
      where: { id: document.id },
      data: {
        currentVersion: nextVersion,
        title,
        ...(isSignedCopy
          ? { isSignedCopy: true, signatureRequestId }
          : {}),
      },
    }),
  ]);

  const full = await getDocumentForOrg(params.organisationId, document.id);
  return { document: full, version };
}

export async function renameDocument(params: {
  organisationId: string;
  documentId: string;
  title: string;
}) {
  const title = params.title.trim();
  if (!title) {
    return {
      error: { status: 400, code: "VALIDATION_ERROR", message: "Title is required" },
    };
  }
  if (title.length > 200) {
    return {
      error: {
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Title must be 200 characters or fewer",
      },
    };
  }

  const document = await prisma.document.findFirst({
    where: { id: params.documentId, organisationId: params.organisationId },
  });
  if (!document) {
    return { error: { status: 404, code: "NOT_FOUND", message: "Document not found" } };
  }
  if (document.isSignedCopy) {
    return {
      error: {
        status: 409,
        code: "SIGNED_COPY_LOCKED",
        message: "Signed copies cannot be renamed",
      },
    };
  }

  const clash = await prisma.document.findFirst({
    where: {
      organisationId: params.organisationId,
      folderId: document.folderId,
      title,
      NOT: { id: document.id },
    },
    select: { id: true },
  });
  if (clash) {
    return {
      error: {
        status: 409,
        code: "TITLE_TAKEN",
        message: "Another file in this folder already uses that name",
      },
    };
  }

  await prisma.document.update({
    where: { id: document.id },
    data: { title },
  });

  const full = await getDocumentForOrg(params.organisationId, document.id);
  return { document: full };
}

export async function deleteDocument(organisationId: string, documentId: string) {
  const document = await prisma.document.findFirst({
    where: { id: documentId, organisationId },
    include: { versions: true },
  });
  if (!document) return null;

  for (const version of document.versions) {
    await removeStoredFile(version.storagePath);
  }

  await prisma.document.delete({ where: { id: document.id } });
  return document;
}
