import { Router } from "express";
import path from "path";
import multer from "multer";
import { prisma } from "../lib/prisma";
import { absoluteStoragePath } from "../lib/storage";
import { requireAuth, requireClient, requirePasswordSettled } from "../middleware/auth";
import {
  getSignatureRequestById,
  isClientVisibleStatus,
  listSignatureRequests,
  signSignatureRequest,
} from "../services/signatures";

const router = Router();
router.use(requireAuth, requireClient, requirePasswordSettled);

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
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${row.sourceFileName.replace(/"/g, "")}"`
  );
  return res.sendFile(absoluteStoragePath(pathToSend));
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
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Disposition", 'inline; filename="field-signature.png"');
  return res.sendFile(absoluteStoragePath(field.signedImagePath));
});

router.post("/signature-requests/:id/sign", (req, res) => {
  multiUpload(req, res, async (err) => {
    if (err) {
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
        const fs = await import("fs/promises");
        fallback = await fs.readFile(absoluteStoragePath(relative));
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

export default router;
