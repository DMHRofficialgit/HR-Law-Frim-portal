import { Router } from "express";
import path from "path";
import { prisma } from "../lib/prisma";
import { sendStoredFile } from "../lib/send-stored-file";
import { readStoredFile } from "../lib/storage";
import { requireAuth, requireClient, requirePasswordSettled } from "../middleware/auth";
import {
  anyUpload,
  consumeUploadedFile,
  discardUploadedFiles,
} from "../middleware/upload";
import { uploadConcurrencyLimiter } from "../middleware/uploadConcurrency";
import {
  getSignatureRequestById,
  isClientVisibleStatus,
  listSignatureRequests,
  signSignatureRequest,
} from "../services/signatures";

const router = Router();
router.use(requireAuth, requireClient, requirePasswordSettled);

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
  const organisationId = req.auth!.organisationId!;
  const rows = await listSignatureRequests({ organisationId, clientVisibleOnly: true });
  return res.status(200).json({ success: true, data: { requests: rows } });
});

router.get("/signature-requests/:id", async (req, res) => {
  const row = await getSignatureRequestById(String(req.params.id));
  if (
    !row ||
    row.organisationId !== req.auth!.organisationId ||
    !isClientVisibleStatus(row.status)
  ) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Signature request not found" },
    });
  }
  return res.status(200).json({ success: true, data: { request: row } });
});

router.get("/signature-requests/:id/file", async (req, res) => {
  const row = await prisma.signatureRequest.findFirst({
    where: { id: String(req.params.id), organisationId: req.auth!.organisationId! },
  });
  if (!row || !isClientVisibleStatus(row.status)) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Signature request not found" },
    });
  }
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
  const request = await prisma.signatureRequest.findFirst({
    where: { id: String(req.params.id), organisationId: req.auth!.organisationId! },
  });
  if (!request || !isClientVisibleStatus(request.status)) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Signature request not found" },
    });
  }
  const field = await prisma.signatureField.findFirst({
    where: {
      id: String(req.params.fieldId),
      requestId: request.id,
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
      const typedName = String(req.body.typedName || "");
      const saveToProfile =
        String(req.body.saveToProfile || "") === "true" || req.body.saveToProfile === true;
      const useSavedSignature =
        String(req.body.useSavedSignature || "") === "true" ||
        req.body.useSavedSignature === true;

      const files = (req.files || []) as Express.Multer.File[];
      const uploadedFiles = await Promise.all(
        files.map(async (file) => ({
          fieldName: file.fieldname,
          uploaded: await consumeUploadedFile(file),
        }))
      );
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
          Object.assign(
            fieldTexts,
            JSON.parse(req.body.fieldTexts) as Record<string, string>
          );
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
        organisationId: req.auth!.organisationId!,
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
        message: complete ? "Document signed" : "Your fields submitted — waiting on others",
      });
    } catch (e) {
      await discardUploadedFiles(req.files as Express.Multer.File[]);
      return serviceError(e, res);
    }
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
  const row = await prisma.signatureRequest.findFirst({
    where: { id: String(req.params.id), organisationId: req.auth!.organisationId! },
  });
  if (!row || !isClientVisibleStatus(row.status)) {
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

export default router;
