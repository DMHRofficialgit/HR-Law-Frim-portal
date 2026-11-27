import { Router } from "express";
import path from "path";
import { prisma } from "../lib/prisma";
import { sendStoredFile } from "../lib/send-stored-file";
import { readStoredFile } from "../lib/storage";
import { requireAuth, requireAdmin, requirePasswordSettled } from "../middleware/auth";
import {
  anyUpload,
  consumeUploadedFile,
  discardUploadedFile,
  discardUploadedFiles,
  singleUpload,
} from "../middleware/upload";
import { uploadConcurrencyLimiter } from "../middleware/uploadConcurrency";
import {
  createDraftFromDocument,
  createSignatureRequest,
  getSignatureRequestById,
  listEsignAssignees,
  listSignatureRequests,
  markReady,
  reopenForEdit,
  replaceCcRecipients,
  replaceFields,
  requestRevision,
  reuploadSignedCopy,
  reviewSignatureRequest,
  sendForSignature,
  signSignatureRequest,
  type FieldInput,
} from "../services/signatures";

function clientIp(req: {
  headers: Record<string, unknown>;
  socket: { remoteAddress?: string };
}) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || null;
}

const router = Router();
router.use(requireAuth, requireAdmin, requirePasswordSettled);

function serviceError(err: unknown, res: import("express").Response) {
  const e = err as { status?: number; code?: string; message?: string };
  return res.status(e.status || 500).json({
    success: false,
    error: {
      code: e.code || "SERVER_ERROR",
      message: e.message || "Unexpected error",
    },
  });
}

router.get("/signature-requests", async (req, res) => {
  const organisationId =
    typeof req.query.organisationId === "string" ? req.query.organisationId : undefined;
  const rows = await listSignatureRequests({ organisationId });
  return res.status(200).json({ success: true, data: { requests: rows } });
});

router.get("/signature-requests/:id", async (req, res) => {
  const row = await getSignatureRequestById(String(req.params.id));
  if (!row) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Signature request not found" },
    });
  }
  return res.status(200).json({ success: true, data: { request: row } });
});

/** Part 4.1: create draft from existing org document */
router.post("/signature-requests/from-document", async (req, res) => {
  try {
    const organisationId = String(req.body.organisationId || "");
    const sourceDocumentId = String(req.body.sourceDocumentId || "");
    const title = req.body.title ? String(req.body.title) : undefined;
    if (!organisationId || !sourceDocumentId) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "organisationId and sourceDocumentId are required",
        },
      });
    }
    const { request, reused } = await createDraftFromDocument({
      organisationId,
      sourceDocumentId,
      createdById: req.auth!.id,
      title,
    });
    return res.status(reused ? 200 : 201).json({
      success: true,
      data: { request, reused },
      message: reused
        ? "Opened existing signature request for this document"
        : "E-sign draft created — place signature fields",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.post(
  "/signature-requests",
  uploadConcurrencyLimiter,
  singleUpload,
  async (req, res) => {
    try {
      const uploaded = req.file ? await consumeUploadedFile(req.file) : null;
      const organisationId = String(req.body.organisationId || "");
      const title = String(req.body.title || "");
      const sourceDocumentId = req.body.sourceDocumentId
        ? String(req.body.sourceDocumentId)
        : null;
      if (!organisationId || !title.trim()) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "organisationId and title are required" },
        });
      }
      const file = uploaded
        ? {
            buffer: uploaded.buffer,
            originalname: uploaded.originalName,
            mimetype: uploaded.mimeType,
            size: uploaded.size,
          }
        : null;
      const created = await createSignatureRequest({
        organisationId,
        title,
        createdById: req.auth!.id,
        sourceDocumentId,
        file,
      });
      return res.status(201).json({
        success: true,
        data: { request: created },
        message: "E-sign draft created",
      });
    } catch (err) {
      await discardUploadedFile(req.file);
      return serviceError(err, res);
    }
  }
);

router.put("/signature-requests/:id/fields", async (req, res) => {
  try {
    const fields = (req.body.fields || []) as FieldInput[];
    if (!Array.isArray(fields)) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "fields must be an array" },
      });
    }
    const updated = await replaceFields({ id: String(req.params.id), fields });
    return res.status(200).json({ success: true, data: { request: updated }, message: "Fields saved" });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.put("/signature-requests/:id/cc", async (req, res) => {
  try {
    const userIds = Array.isArray(req.body.userIds)
      ? (req.body.userIds as unknown[]).map((id) => String(id))
      : [];
    const updated = await replaceCcRecipients({
      id: String(req.params.id),
      userIds,
    });
    return res.status(200).json({
      success: true,
      data: { request: updated },
      message: "CC recipients saved",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.get("/signature-requests/:id/assignees", async (req, res) => {
  try {
    const row = await getSignatureRequestById(String(req.params.id));
    if (!row) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Signature request not found" },
      });
    }
    const users = await listEsignAssignees(row.organisationId);
    return res.status(200).json({ success: true, data: { users } });
  } catch (err) {
    return serviceError(err, res);
  }
});

/** Admin assignee fills their own fields (Part 4.2). */
router.post("/signature-requests/:id/sign", uploadConcurrencyLimiter, (req, res) => {
  anyUpload(req, res, async (err) => {
    if (err) {
      await discardUploadedFiles(req.files as Express.Multer.File[]);
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Upload failed" },
      });
    }
    try {
      const files = (req.files || []) as Express.Multer.File[];
      const uploadedFiles = await Promise.all(
        files.map(async (file) => ({
          fieldName: file.fieldname,
          uploaded: await consumeUploadedFile(file),
        }))
      );
      const row = await getSignatureRequestById(String(req.params.id));
      if (!row) {
        return res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Signature request not found" },
        });
      }

      const typedName = String(req.body.typedName || "");
      const saveToProfile =
        String(req.body.saveToProfile || "") === "true" || req.body.saveToProfile === true;
      const useSavedSignature =
        String(req.body.useSavedSignature || "") === "true" ||
        req.body.useSavedSignature === true;

      const fieldImages: Record<string, Buffer> = {};
      let fallback: Buffer | null = null;
      const fieldTexts: Record<string, string> = {};

      for (const { fieldName, uploaded } of uploadedFiles) {
        if (fieldName.startsWith("field_")) {
          fieldImages[fieldName.slice("field_".length)] = uploaded.buffer;
        } else if (fieldName === "file") {
          fallback = uploaded.buffer;
        }
      }

      if (req.body.fieldTexts && typeof req.body.fieldTexts === "string") {
        try {
          const parsed = JSON.parse(req.body.fieldTexts) as Record<string, string>;
          Object.assign(fieldTexts, parsed);
        } catch {
          /* ignore */
        }
      }
      for (const key of Object.keys(req.body)) {
        if (key.startsWith("text_")) {
          fieldTexts[key.slice("text_".length)] = String(req.body[key] || "");
        }
      }

      if (!fallback && useSavedSignature) {
        const { getProfileSignaturePath } = await import("../services/profileSignatures");
        const relative = await getProfileSignaturePath(
          req.auth!.id,
          typeof req.body.signatureId === "string" ? req.body.signatureId : null
        );
        if (!relative) {
          return res.status(400).json({
            success: false,
            error: { code: "VALIDATION_ERROR", message: "No saved signature on profile" },
          });
        }
        fallback = await readStoredFile(relative);
      }

      const updated = await signSignatureRequest({
        id: String(req.params.id),
        organisationId: row.organisationId,
        signedById: req.auth!.id,
        typedName,
        agreed: true,
        ip: clientIp(req),
        saveToProfile,
        fieldImages,
        fieldTexts,
        fallbackSignaturePng: fallback,
      });

      const complete = updated?.status === "signed_returned";
      return res.status(200).json({
        success: true,
        data: { request: updated },
        message: complete ? "Document fully signed" : "Your fields submitted — waiting on others",
      });
    } catch (e) {
      await discardUploadedFiles(req.files as Express.Multer.File[]);
      return serviceError(e, res);
    }
  });
});

router.post("/signature-requests/:id/ready", async (req, res) => {
  try {
    const updated = await markReady(String(req.params.id));
    return res.status(200).json({
      success: true,
      data: { request: updated },
      message: "Marked ready — assignees can Finish my part; then Send for others",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.post("/signature-requests/:id/reopen", async (req, res) => {
  try {
    const updated = await reopenForEdit(String(req.params.id));
    return res.status(200).json({
      success: true,
      data: { request: updated },
      message: "Reopened for field editing (early signatures cleared)",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.post("/signature-requests/:id/send", async (req, res) => {
  try {
    const updated = await sendForSignature(String(req.params.id));
    return res.status(200).json({
      success: true,
      data: { request: updated },
      message: "Sent to client for signature",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.post("/signature-requests/:id/review", async (req, res) => {
  try {
    const result = await reviewSignatureRequest({
      id: String(req.params.id),
      reviewedById: req.auth!.id,
    });
    const fileLabel = result.published?.title
      ? ` Signed file in Documents: “${result.published.title}”.`
      : "";
    return res.status(200).json({
      success: true,
      data: { request: result.request, published: result.published },
      message: `Marked as complete.${fileLabel}`,
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.post("/signature-requests/:id/revision", async (req, res) => {
  try {
    const updated = await requestRevision({
      id: String(req.params.id),
      note: typeof req.body?.note === "string" ? req.body.note : undefined,
    });
    return res.status(200).json({
      success: true,
      data: { request: updated },
      message: "Revision requested",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.post(
  "/signature-requests/:id/reupload",
  uploadConcurrencyLimiter,
  singleUpload,
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "file is required" },
        });
      }
      const uploaded = await consumeUploadedFile(req.file);
      const updated = await reuploadSignedCopy({
        id: String(req.params.id),
        uploadedById: req.auth!.id,
        file: {
          buffer: uploaded.buffer,
          originalname: uploaded.originalName,
          mimetype: uploaded.mimeType,
          size: uploaded.size,
        },
      });
      return res.status(200).json({
        success: true,
        data: { request: updated },
        message: "Signed copy uploaded",
      });
    } catch (err) {
      await discardUploadedFile(req.file);
      return serviceError(err, res);
    }
  }
);

router.get("/signature-requests/:id/file", async (req, res) => {
  const row = await prisma.signatureRequest.findUnique({
    where: { id: String(req.params.id) },
  });
  if (!row) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Signature request not found" },
    });
  }
  // Prefer stamped PDF when available so Admin/Client preview shows ink
  const wantSigned = String(req.query.signed || "") === "1" || String(req.query.signed || "") === "true";
  const pathToSend =
    wantSigned && row.signedStoragePath ? row.signedStoragePath : row.sourceStoragePath;
  await sendStoredFile(res, pathToSend, {
    mimeType: "application/pdf",
    fileName: row.sourceFileName,
    disposition: "inline",
  });
});

router.get("/signature-requests/:id/fields/:fieldId/image", async (req, res) => {
  const field = await prisma.signatureField.findFirst({
    where: {
      id: String(req.params.fieldId),
      requestId: String(req.params.id),
    },
  });
  if (!field?.signedImagePath) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Signed field image not found" },
    });
  }
  await sendStoredFile(res, field.signedImagePath, {
    mimeType: "image/png",
    fileName: "field-signature.png",
    disposition: "inline",
  });
});

router.get("/signature-requests/:id/download/:kind", async (req, res) => {
  const kind = String(req.params.kind);
  if (!["source", "signed", "signature", "audit"].includes(kind)) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid download kind" },
    });
  }
  const row = await prisma.signatureRequest.findUnique({
    where: { id: String(req.params.id) },
  });
  if (!row) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Signature request not found" },
    });
  }
  const map: Record<string, string | null | undefined> = {
    source: row.sourceStoragePath,
    signed: row.signedStoragePath,
    signature: row.signatureImagePath,
    audit: row.auditStoragePath,
  };
  const relative = map[kind];
  if (!relative) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "File not available yet" },
    });
  }
  const fileName =
    kind === "source"
      ? row.sourceFileName
      : kind === "signed"
        ? path.basename(relative)
        : kind === "signature"
          ? "signature.png"
          : "audit.json";
  const mimeType =
    kind === "signature"
      ? "image/png"
      : kind === "audit"
        ? "application/json"
        : "application/pdf";
  await sendStoredFile(res, relative, {
    mimeType,
    fileName,
    disposition: "attachment",
  });
});

router.get("/organisations/:orgId/documents-flat", async (req, res) => {
  const docs = await prisma.document.findMany({
    where: { organisationId: String(req.params.orgId) },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: {
      folder: { select: { name: true } },
      versions: { orderBy: { versionNumber: "desc" }, take: 1 },
    },
  });
  return res.status(200).json({
    success: true,
    data: {
      documents: docs.map((d) => ({
        id: d.id,
        title: d.title,
        folderName: d.folder.name,
        fileName: d.versions[0]?.fileName || null,
        mimeType: d.versions[0]?.mimeType || null,
      })),
    },
  });
});

export default router;
