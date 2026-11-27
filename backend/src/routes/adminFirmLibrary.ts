import { Router } from "express";
import { requireAuth, requireAdmin, requirePasswordSettled } from "../middleware/auth";
import { sendStoredFile } from "../lib/send-stored-file";
import {
  consumeUploadedFile,
  discardUploadedFile,
  singleUpload,
} from "../middleware/upload";
import { uploadConcurrencyLimiter } from "../middleware/uploadConcurrency";
import {
  deleteFirmLibraryDocument,
  getFirmLibraryDocument,
  getFirmLibraryFieldInkAbsolute,
  getFirmLibraryFileAbsolute,
  listFirmLibrary,
  replaceFirmLibraryFields,
  updateFirmLibraryDocument,
  uploadFirmLibraryDocument,
} from "../services/firmLibrary";
import { recordAuditFromReq } from "../services/audit";

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

router.get("/firm-library", async (_req, res) => {
  const documents = await listFirmLibrary();
  return res.status(200).json({ success: true, data: { documents } });
});

router.post(
  "/firm-library",
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
      const requiresSignature =
        req.body.requiresSignature === undefined
          ? true
          : String(req.body.requiresSignature) === "true" || req.body.requiresSignature === true;
      const uploaded = await consumeUploadedFile(req.file);
      const created = await uploadFirmLibraryDocument({
        title: req.body.title ? String(req.body.title) : undefined,
        requiresSignature,
        journeyRole: req.body.journeyRole ? String(req.body.journeyRole) : undefined,
        file: {
          originalName: uploaded.originalName,
          mimeType: uploaded.mimeType,
          size: uploaded.size,
          buffer: uploaded.buffer,
        },
      });
      void recordAuditFromReq(req, {
        action: "firm_library.upload",
        entityType: "firm_library_document",
        entityId: created.id,
        summary: `Uploaded “${created.title}” to Firm Library`,
      });
      return res.status(201).json({
        success: true,
        data: { document: created },
        message: "Added to Firm Library",
      });
    } catch (err) {
      await discardUploadedFile(req.file);
      return serviceError(err, res);
    }
  }
);

router.get("/firm-library/:id", async (req, res) => {
  try {
    const document = await getFirmLibraryDocument(String(req.params.id));
    return res.status(200).json({ success: true, data: { document } });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.put("/firm-library/:id/fields", async (req, res) => {
  try {
    const fields = Array.isArray(req.body.fields) ? req.body.fields : [];
    const document = await replaceFirmLibraryFields({
      id: String(req.params.id),
      fields,
    });
    return res.status(200).json({
      success: true,
      data: { document },
      message: "Signature layout saved on template",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.patch("/firm-library/:id", async (req, res) => {
  try {
    const updated = await updateFirmLibraryDocument({
      id: String(req.params.id),
      title: typeof req.body.title === "string" ? req.body.title : undefined,
      requiresSignature:
        typeof req.body.requiresSignature === "boolean"
          ? req.body.requiresSignature
          : req.body.requiresSignature === "true"
            ? true
            : req.body.requiresSignature === "false"
              ? false
              : undefined,
      journeyRole:
        typeof req.body.journeyRole === "string" ? req.body.journeyRole : undefined,
      sortOrder:
        typeof req.body.sortOrder === "number" ? req.body.sortOrder : undefined,
    });
    return res.status(200).json({ success: true, data: { document: updated } });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.delete("/firm-library/:id", async (req, res) => {
  try {
    const deleted = await deleteFirmLibraryDocument(String(req.params.id));
    void recordAuditFromReq(req, {
      action: "firm_library.delete",
      entityType: "firm_library_document",
      entityId: deleted.id,
      summary: `Deleted “${deleted.title}” from Firm Library`,
    });
    return res.status(200).json({ success: true, data: null, message: "Removed from library" });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.get("/firm-library/:id/file", async (req, res) => {
  try {
    const { row, storagePath } = await getFirmLibraryFileAbsolute(String(req.params.id));
    await sendStoredFile(res, storagePath, {
      mimeType: row.mimeType,
      fileName: row.fileName,
      disposition: "inline",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.get("/firm-library/:id/fields/:fieldId/ink", async (req, res) => {
  try {
    const { storagePath } = await getFirmLibraryFieldInkAbsolute(
      String(req.params.id),
      String(req.params.fieldId)
    );
    res.setHeader("Cache-Control", "private, max-age=60");
    await sendStoredFile(res, storagePath, {
      mimeType: "image/png",
      disposition: "inline",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

export default router;
