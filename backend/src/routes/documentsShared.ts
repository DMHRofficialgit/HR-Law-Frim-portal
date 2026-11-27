import type { Request, Response } from "express";
import { z } from "zod";
import { ensureFoldersForOrganisation } from "../lib/folders";
import { sendStoredFile } from "../lib/send-stored-file";
import {
  getUploadSettings,
  PRODUCT_UPLOAD_EXTENSIONS,
  PRODUCT_UPLOAD_MIME_TYPES,
} from "../lib/uploadSettings";
import {
  deleteDocument,
  getDocumentForOrg,
  listDocuments,
  listFolders,
  renameDocument,
  uploadDocument,
} from "../services/documents";
import { prisma } from "../lib/prisma";
import { consumeUploadedFile, discardUploadedFile } from "../middleware/upload";
import { recordAuditFromReq } from "../services/audit";

export async function handleListFolders(organisationId: string, res: Response) {
  await ensureFoldersForOrganisation(prisma, organisationId);
  const folders = await listFolders(organisationId);
  return res.status(200).json({
    success: true,
    data: {
      folders: folders.map((f) => ({
        id: f.id,
        key: f.key,
        name: f.name,
        sortOrder: f.sortOrder,
        documentCount: f._count.documents,
      })),
    },
  });
}

export async function handleListDocuments(
  organisationId: string,
  folderId: string,
  res: Response
) {
  const result = await listDocuments(organisationId, folderId);
  if (!result) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Folder not found" },
    });
  }

  return res.status(200).json({
    success: true,
    data: {
      folder: {
        id: result.folder.id,
        key: result.folder.key,
        name: result.folder.name,
      },
      documents: result.documents.map((doc) => ({
        id: doc.id,
        title: doc.title,
        currentVersion: doc.currentVersion,
        isSignedCopy: doc.isSignedCopy,
        signatureRequestId: doc.signatureRequestId,
        updatedAt: doc.updatedAt,
        createdBy: doc.createdBy,
        latestVersion: doc.versions[0]
          ? {
              id: doc.versions[0].id,
              versionNumber: doc.versions[0].versionNumber,
              fileName: doc.versions[0].fileName,
              mimeType: doc.versions[0].mimeType,
              sizeBytes: doc.versions[0].sizeBytes,
              createdAt: doc.versions[0].createdAt,
            }
          : null,
      })),
    },
  });
}

export async function handleUpload(
  req: Request,
  res: Response,
  organisationId: string,
  folderId: string
) {
  const file = req.file;
  if (!file) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "file is required" },
    });
  }

  try {
    const uploaded = await consumeUploadedFile(file);
    const documentId =
      typeof req.body?.documentId === "string" && req.body.documentId.length > 0
        ? req.body.documentId
        : undefined;

    const result = await uploadDocument({
      organisationId,
      folderId,
      userId: req.auth!.id,
      documentId,
      file: {
        originalName: uploaded.originalName,
        mimeType: uploaded.mimeType,
        size: uploaded.size,
        buffer: uploaded.buffer,
      },
    });

    if ("error" in result && result.error) {
      return res.status(result.error.status).json({
        success: false,
        error: { code: result.error.code, message: result.error.message },
      });
    }

    if (result.document) {
      void recordAuditFromReq(req, {
        action: "document.upload",
        entityType: "document",
        entityId: result.document.id,
        organisationId,
        summary: `Uploaded document “${result.document.title}”`,
        meta: { created: result.created !== false },
      });
    }

    return res.status(201).json({
      success: true,
      data: {
        document: result.document,
        created: result.created !== false,
      },
      message: result.created === false ? "File updated" : "File uploaded",
    });
  } catch (err) {
    await discardUploadedFile(file);
    throw err;
  }
}

export async function handleVersions(
  organisationId: string,
  documentId: string,
  res: Response
) {
  const document = await getDocumentForOrg(organisationId, documentId);
  if (!document) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Document not found" },
    });
  }

  return res.status(200).json({
    success: true,
    data: {
      document: {
        id: document.id,
        title: document.title,
        currentVersion: document.currentVersion,
        folder: { id: document.folder.id, key: document.folder.key, name: document.folder.name },
      },
      versions: document.versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        fileName: v.fileName,
        mimeType: v.mimeType,
        sizeBytes: v.sizeBytes,
        createdAt: v.createdAt,
        uploadedById: v.uploadedById,
      })),
    },
  });
}

export async function handleDownload(
  organisationId: string,
  documentId: string,
  req: Request,
  res: Response
) {
  const document = await getDocumentForOrg(organisationId, documentId);
  if (!document) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Document not found" },
    });
  }

  const versionParam = req.query.version;
  const versionNumber =
    typeof versionParam === "string" && versionParam.length > 0
      ? Number(versionParam)
      : document.currentVersion;

  const version = document.versions.find((v) => v.versionNumber === versionNumber);
  if (!version) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Version not found" },
    });
  }

  void recordAuditFromReq(req, {
    action: "document.download",
    entityType: "document",
    entityId: document.id,
    organisationId,
    summary: `Downloaded “${document.title}” (v${version.versionNumber})`,
    meta: { fileName: version.fileName, versionNumber: version.versionNumber },
  });

  await sendStoredFile(res, version.storagePath, {
    mimeType: version.mimeType,
    fileName: version.fileName,
    disposition: "attachment",
  });
}

export async function handleDelete(
  organisationId: string,
  documentId: string,
  req: Request,
  res: Response
) {
  const existing = await getDocumentForOrg(organisationId, documentId);
  const deleted = await deleteDocument(organisationId, documentId);
  if (!deleted) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Document not found" },
    });
  }

  void recordAuditFromReq(req, {
    action: "document.delete",
    entityType: "document",
    entityId: deleted.id,
    organisationId,
    summary: `Deleted document “${existing?.title || deleted.id}”`,
  });

  return res.status(200).json({
    success: true,
    data: { id: deleted.id },
    message: "Document deleted",
  });
}

const renameSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export async function handleRename(
  organisationId: string,
  documentId: string,
  req: Request,
  res: Response
) {
  const parsed = renameSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Valid title is required" },
    });
  }

  const result = await renameDocument({
    organisationId,
    documentId,
    title: parsed.data.title,
  });

  if ("error" in result && result.error) {
    return res.status(result.error.status).json({
      success: false,
      error: { code: result.error.code, message: result.error.message },
    });
  }

  if (result.document) {
    void recordAuditFromReq(req, {
      action: "document.rename",
      entityType: "document",
      entityId: result.document.id,
      organisationId,
      summary: `Renamed document to “${result.document.title}”`,
    });
  }

  return res.status(200).json({
    success: true,
    data: { document: result.document },
    message: "Document renamed",
  });
}

export async function handleGetUploadSettings(res: Response) {
  const settings = await getUploadSettings();
  return res.status(200).json({
    success: true,
    data: { settings },
  });
}

const patchSettingsSchema = z.object({
  allowedExtensions: z.array(z.string().min(1)).min(1).optional(),
  allowedMimeTypes: z.array(z.string().min(1)).min(1).optional(),
  maxUploadBytes: z.number().int().min(1024).max(100 * 1024 * 1024).optional(),
});

export async function handlePatchUploadSettings(req: Request, res: Response) {
  const parsed = patchSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message || "Invalid settings",
      },
    });
  }

  await getUploadSettings();
  const settings = await prisma.uploadSettings.update({
    where: { id: "default" },
    data: {
      // Product-locked types (PDF + Word + images); only max size is Admin-editable.
      allowedExtensions: [...PRODUCT_UPLOAD_EXTENSIONS],
      allowedMimeTypes: [...PRODUCT_UPLOAD_MIME_TYPES],
      ...(parsed.data.maxUploadBytes !== undefined
        ? { maxUploadBytes: parsed.data.maxUploadBytes }
        : {}),
    },
  });

  void recordAuditFromReq(req, {
    action: "settings.upload_save",
    entityType: "upload_settings",
    entityId: settings.id,
    summary: "Saved upload settings",
    meta: { maxUploadBytes: settings.maxUploadBytes },
  });

  return res.status(200).json({
    success: true,
    data: { settings },
    message: "Upload settings updated",
  });
}
