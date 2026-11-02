import { Router } from "express";
import { requireAuth, requireAdmin, requirePasswordSettled } from "../middleware/auth";
import { singleUpload } from "../middleware/upload";
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

router.post("/firm-library", singleUpload, async (req, res) => {
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
    const created = await uploadFirmLibraryDocument({
      title: req.body.title ? String(req.body.title) : undefined,
      requiresSignature,
      journeyRole: req.body.journeyRole ? String(req.body.journeyRole) : undefined,
      file: {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        buffer: req.file.buffer,
      },
    });
    return res.status(201).json({
      success: true,
      data: { document: created },
      message: "Added to Firm Library",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

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
    await deleteFirmLibraryDocument(String(req.params.id));
    return res.status(200).json({ success: true, data: null, message: "Removed from library" });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.get("/firm-library/:id/file", async (req, res) => {
  try {
    const { row, absolutePath } = await getFirmLibraryFileAbsolute(String(req.params.id));
    res.setHeader("Content-Type", row.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${row.fileName.replace(/"/g, "")}"`
    );
    return res.sendFile(absolutePath);
  } catch (err) {
    return serviceError(err, res);
  }
});

router.get("/firm-library/:id/fields/:fieldId/ink", async (req, res) => {
  try {
    const { absolutePath } = await getFirmLibraryFieldInkAbsolute(
      String(req.params.id),
      String(req.params.fieldId)
    );
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "private, max-age=60");
    return res.sendFile(absolutePath);
  } catch (err) {
    return serviceError(err, res);
  }
});

export default router;
