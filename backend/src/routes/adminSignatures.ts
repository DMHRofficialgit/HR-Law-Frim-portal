import { Router } from "express";
import path from "path";
import multer from "multer";
import { prisma } from "../lib/prisma";
import { absoluteStoragePath } from "../lib/storage";
import { requireAuth, requireAdmin, requirePasswordSettled } from "../middleware/auth";
import { singleUpload } from "../middleware/upload";
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

const multiUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
}).any();

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

router.post("/signature-requests", singleUpload, async (req, res) => {
  try {
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
    const file = req.file
      ? {
          buffer: req.file.buffer,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
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
    return serviceError(err, res);
  }
});

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
router.post("/signature-requests/:id/sign", (req, res) => {
  multiUpload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Upload failed" },
      });
    }
    try {
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

      const files = (req.files || []) as Express.Multer.File[];
      const fieldImages: Record<string, Buffer> = {};
      let fallback: Buffer | null = null;
      const fieldTexts: Record<string, string> = {};

      for (const f of files) {
        if (f.fieldname.startsWith("field_")) {
          fieldImages[f.fieldname.slice("field_".length)] = f.buffer;
        } else if (f.fieldname === "file") {
          fallback = f.buffer;
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
        const fs = await import("fs/promises");
        fallback = await fs.readFile(absoluteStoragePath(relative));
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

router.post("/signature-requests/:id/reupload", singleUpload, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "file is required" },
      });
    }
    const updated = await reuploadSignedCopy({
      id: String(req.params.id),
      uploadedById: req.auth!.id,
      file: {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      },
    });
    return res.status(200).json({
      success: true,
      data: { request: updated },
      message: "Signed copy uploaded",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

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
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${row.sourceFileName.replace(/"/g, "")}"`
  );
  return res.sendFile(absoluteStoragePath(pathToSend));
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
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Disposition", 'inline; filename="field-signature.png"');
  return res.sendFile(absoluteStoragePath(field.signedImagePath));
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
  const absolute = absoluteStoragePath(relative);
  const fileName =
    kind === "source"
      ? row.sourceFileName
      : kind === "signed"
        ? path.basename(relative)
        : kind === "signature"
          ? "signature.png"
          : "audit.json";
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  return res.sendFile(absolute);
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
