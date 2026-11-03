import fs from "fs/promises";
import path from "path";
import { FolderKey } from "@prisma/client";
import {
  ensureFirmStagingFolders,
  FIRM_STAGING_SYSTEM_KEYS,
  slugifyStagingFolderName,
} from "../lib/firmStagingFolders";
import { ensureFoldersForOrganisation } from "../lib/folders";
import { prisma } from "../lib/prisma";
import {
  absoluteStoragePath,
  removeStoredFile,
  writeStoredFile,
} from "../lib/storage";
import { uploadDocument, validateUpload, type UploadedFileInput } from "./documents";

function httpError(message: string, status: number, code: string) {
  return Object.assign(new Error(message), { status, code });
}

function sanitizeBaseName(fileName: string) {
  const base = path.basename(fileName).replace(/[^\w.\- ()[\]]+/g, "_").trim();
  return base || "document";
}

const CLIENT_FOLDER_KEYS = new Set<string>([
  FolderKey.my_documents,
  FolderKey.my_policies,
  FolderKey.my_handbook,
  FolderKey.my_contracts,
  FolderKey.my_useful_documents,
  FolderKey.my_private_space,
]);

/** Target folder when copying into client Documents — six only. */
export function parseClientDocumentFolderKey(raw: unknown): FolderKey {
  const v = String(raw || "").trim();
  if (CLIENT_FOLDER_KEYS.has(v)) return v as FolderKey;
  throw httpError(
    "folderKey must be one of the six document folders (not My Onboarding)",
    400,
    "VALIDATION_ERROR"
  );
}

function serializeFile(row: {
  id: string;
  folderId: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; name: string; email: string } | null;
}) {
  return {
    id: row.id,
    folderId: row.folderId,
    title: row.title,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
  };
}

function serializeFolder(f: {
  id: string;
  key: string;
  name: string;
  sortOrder: number;
  isSystem: boolean;
  _count: { files: number };
}) {
  return {
    id: f.id,
    key: f.key,
    name: f.name,
    sortOrder: f.sortOrder,
    isSystem: f.isSystem,
    fileCount: f._count.files,
  };
}

export async function listFirmStaging(folderId?: string) {
  await ensureFirmStagingFolders(prisma);

  const folders = await prisma.firmStagingFolder.findMany({
    orderBy: [{ isSystem: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { files: true } },
    },
  });

  const activeFolderId =
    folderId && folders.some((f) => f.id === folderId)
      ? folderId
      : folders[0]?.id || null;

  const files = activeFolderId
    ? await prisma.firmStagingFile.findMany({
        where: { folderId: activeFolderId },
        orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      })
    : [];

  return {
    folders: folders.map(serializeFolder),
    folderId: activeFolderId,
    files: files.map(serializeFile),
  };
}

export async function createFirmStagingFolder(params: { name: string }) {
  await ensureFirmStagingFolders(prisma);

  const name = params.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) {
    throw httpError("Folder name must be at least 2 characters", 400, "VALIDATION_ERROR");
  }
  if (name.length > 80) {
    throw httpError("Folder name is too long", 400, "VALIDATION_ERROR");
  }

  const duplicateName = await prisma.firmStagingFolder.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (duplicateName) {
    throw httpError("A folder with that name already exists", 409, "CONFLICT");
  }

  let slug = slugifyStagingFolderName(name);
  if (FIRM_STAGING_SYSTEM_KEYS.has(slug) || CLIENT_FOLDER_KEYS.has(slug)) {
    slug = `custom_${slug}`;
  }

  let key = `custom_${slug}`;
  let n = 0;
  while (await prisma.firmStagingFolder.findUnique({ where: { key } })) {
    n += 1;
    key = `custom_${slug}_${n}`;
  }

  const maxCustom = await prisma.firmStagingFolder.aggregate({
    where: { isSystem: false },
    _max: { sortOrder: true },
  });
  const sortOrder = Math.max(100, (maxCustom._max.sortOrder || 99) + 1);

  const created = await prisma.firmStagingFolder.create({
    data: {
      key,
      name,
      sortOrder,
      isSystem: false,
    },
    include: { _count: { select: { files: true } } },
  });

  return serializeFolder(created);
}

export async function deleteFirmStagingFolder(id: string) {
  const folder = await prisma.firmStagingFolder.findUnique({
    where: { id },
    include: { _count: { select: { files: true } } },
  });
  if (!folder) throw httpError("Staging folder not found", 404, "NOT_FOUND");
  if (folder.isSystem) {
    throw httpError("System vault folders cannot be deleted", 400, "VALIDATION_ERROR");
  }
  if (folder._count.files > 0) {
    throw httpError("Move or delete files before removing this folder", 400, "VALIDATION_ERROR");
  }
  await prisma.firmStagingFolder.delete({ where: { id } });
}

export async function uploadFirmStagingFile(params: {
  folderId: string;
  title?: string;
  userId: string;
  file: UploadedFileInput;
}) {
  await ensureFirmStagingFolders(prisma);

  const folder = await prisma.firmStagingFolder.findUnique({
    where: { id: params.folderId },
  });
  if (!folder) throw httpError("Staging folder not found", 404, "NOT_FOUND");

  const validation = await validateUpload(params.file);
  if (!validation.ok) {
    throw httpError(validation.message, 400, "UPLOAD_REJECTED");
  }

  const safeName = sanitizeBaseName(params.file.originalName);
  const title = (params.title || safeName.replace(/\.[^.]+$/, "") || safeName).trim();
  const storedName = `${Date.now()}_${safeName}`;
  const storagePath = await writeStoredFile(
    path.join("firm-staging", folder.id),
    storedName,
    params.file.buffer
  );

  const created = await prisma.firmStagingFile.create({
    data: {
      folderId: folder.id,
      title,
      fileName: safeName,
      mimeType: params.file.mimeType || "application/octet-stream",
      sizeBytes: params.file.size,
      storagePath,
      createdById: params.userId,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  return serializeFile(created);
}

export async function renameFirmStagingFile(params: { id: string; title: string }) {
  const existing = await prisma.firmStagingFile.findUnique({ where: { id: params.id } });
  if (!existing) throw httpError("Staging file not found", 404, "NOT_FOUND");

  const title = params.title.trim();
  if (!title) throw httpError("title is required", 400, "VALIDATION_ERROR");

  const updated = await prisma.firmStagingFile.update({
    where: { id: params.id },
    data: { title },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
  return serializeFile(updated);
}

export async function deleteFirmStagingFile(id: string) {
  const existing = await prisma.firmStagingFile.findUnique({ where: { id } });
  if (!existing) throw httpError("Staging file not found", 404, "NOT_FOUND");

  await removeStoredFile(existing.storagePath);
  await prisma.firmStagingFile.delete({ where: { id } });
}

export async function getFirmStagingFileAbsolute(id: string) {
  const row = await prisma.firmStagingFile.findUnique({ where: { id } });
  if (!row) throw httpError("Staging file not found", 404, "NOT_FOUND");
  return { row, absolutePath: absoluteStoragePath(row.storagePath) };
}

export async function copyFirmStagingFileToClient(params: {
  fileId: string;
  organisationId: string;
  folderKey: string;
  userId: string;
}) {
  const staging = await prisma.firmStagingFile.findUnique({
    where: { id: params.fileId },
  });
  if (!staging) throw httpError("Staging file not found", 404, "NOT_FOUND");

  const clientFolderKey = parseClientDocumentFolderKey(params.folderKey);

  const org = await prisma.organisation.findUnique({
    where: { id: params.organisationId },
    select: { id: true, name: true, status: true },
  });
  if (!org) throw httpError("Organisation not found", 404, "NOT_FOUND");
  if (String(org.status || "").toLowerCase() !== "active") {
    throw httpError(
      "Cannot copy into an inactive organisation",
      400,
      "VALIDATION_ERROR"
    );
  }

  await ensureFoldersForOrganisation(prisma, org.id);
  const folder = await prisma.documentFolder.findUnique({
    where: {
      organisationId_key: {
        organisationId: org.id,
        key: clientFolderKey,
      },
    },
  });
  if (!folder) throw httpError("Client folder not found", 404, "NOT_FOUND");

  const bytes = await fs.readFile(absoluteStoragePath(staging.storagePath));
  const result = await uploadDocument({
    organisationId: org.id,
    folderId: folder.id,
    userId: params.userId,
    title: staging.title,
    file: {
      originalName: staging.fileName,
      mimeType: staging.mimeType,
      size: staging.sizeBytes,
      buffer: bytes,
    },
  });

  if ("error" in result && result.error) {
    throw httpError(result.error.message, result.error.status, result.error.code);
  }

  return {
    organisation: { id: org.id, name: org.name },
    folder: { id: folder.id, key: folder.key, name: folder.name },
    document: result.document,
    created: result.created !== false,
  };
}

export async function copyFirmStagingFilesToClient(params: {
  fileIds: string[];
  organisationId: string;
  folderKey: string;
  userId: string;
}) {
  const ids = Array.from(
    new Set(params.fileIds.map((id) => String(id || "").trim()).filter(Boolean))
  );
  if (!ids.length) {
    throw httpError("Select at least one file", 400, "VALIDATION_ERROR");
  }

  const results: Array<{
    fileId: string;
    title: string;
    ok: boolean;
    created?: boolean;
    error?: string;
  }> = [];

  let organisation: { id: string; name: string } | null = null;
  let folder: { id: string; key: string; name: string } | null = null;

  for (const fileId of ids) {
    const staging = await prisma.firmStagingFile.findUnique({
      where: { id: fileId },
      select: { id: true, title: true },
    });
    if (!staging) {
      results.push({ fileId, title: fileId, ok: false, error: "Staging file not found" });
      continue;
    }
    try {
      const copied = await copyFirmStagingFileToClient({
        fileId,
        organisationId: params.organisationId,
        folderKey: params.folderKey,
        userId: params.userId,
      });
      organisation = copied.organisation;
      folder = copied.folder;
      results.push({
        fileId,
        title: staging.title,
        ok: true,
        created: copied.created,
      });
    } catch (err) {
      const e = err as { message?: string };
      results.push({
        fileId,
        title: staging.title,
        ok: false,
        error: e.message || "Copy failed",
      });
    }
  }

  const copied = results.filter((r) => r.ok).length;
  const failed = results.length - copied;

  return {
    organisation,
    folder,
    results,
    copied,
    failed,
  };
}
