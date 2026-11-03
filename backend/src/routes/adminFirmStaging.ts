import { createReadStream } from "fs";
import fs from "fs/promises";
import { Router } from "express";
import { requireAuth, requireAdmin, requirePasswordSettled } from "../middleware/auth";
import { singleUpload } from "../middleware/upload";
import {
  copyFirmStagingFileToClient,
  copyFirmStagingFilesToClient,
  createFirmStagingFolder,
  deleteFirmStagingFile,
  deleteFirmStagingFolder,
  getFirmStagingFileAbsolute,
  listFirmStaging,
  renameFirmStagingFile,
  uploadFirmStagingFile,
} from "../services/firmStaging";

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

router.get("/firm-staging", async (req, res) => {
  try {
    const folderId =
      typeof req.query.folderId === "string" && req.query.folderId.length > 0
        ? req.query.folderId
        : undefined;
    const data = await listFirmStaging(folderId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.post("/firm-staging/folders", async (req, res) => {
  try {
    const name = String(req.body.name || "");
    const folder = await createFirmStagingFolder({ name });
    return res.status(201).json({
      success: true,
      data: { folder },
      message: "Folder created",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.delete("/firm-staging/folders/:id", async (req, res) => {
  try {
    await deleteFirmStagingFolder(String(req.params.id));
    return res.status(200).json({
      success: true,
      data: { ok: true },
      message: "Folder deleted",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.post("/firm-staging/files", singleUpload, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "file is required" },
      });
    }
    const folderId = String(req.body.folderId || "");
    if (!folderId) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "folderId is required" },
      });
    }
    const created = await uploadFirmStagingFile({
      folderId,
      title: req.body.title ? String(req.body.title) : undefined,
      userId: req.auth!.id,
      file: {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        buffer: req.file.buffer,
      },
    });
    return res.status(201).json({
      success: true,
      data: { file: created },
      message: "Added to Firm staging",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.patch("/firm-staging/files/:id", async (req, res) => {
  try {
    const title = String(req.body.title || "");
    const file = await renameFirmStagingFile({
      id: String(req.params.id),
      title,
    });
    return res.status(200).json({
      success: true,
      data: { file },
      message: "File renamed",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.delete("/firm-staging/files/:id", async (req, res) => {
  try {
    await deleteFirmStagingFile(String(req.params.id));
    return res.status(200).json({
      success: true,
      data: { ok: true },
      message: "File deleted",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.get("/firm-staging/files/:id/file", async (req, res) => {
  try {
    const { row, absolutePath } = await getFirmStagingFileAbsolute(String(req.params.id));
    try {
      await fs.access(absolutePath);
    } catch {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "File missing on disk" },
      });
    }
    res.setHeader("Content-Type", row.mimeType || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(row.fileName)}"`
    );
    const stream = createReadStream(absolutePath);
    stream.on("error", () => {
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: { code: "SERVER_ERROR", message: "Failed to read file" },
        });
      } else {
        res.destroy();
      }
    });
    stream.pipe(res);
  } catch (err) {
    return serviceError(err, res);
  }
});

router.post("/firm-staging/files/:id/copy-to-client", async (req, res) => {
  try {
    const organisationId = String(req.body.organisationId || "");
    const folderKey = String(req.body.folderKey || "");
    if (!organisationId || !folderKey) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "organisationId and folderKey are required",
        },
      });
    }
    const result = await copyFirmStagingFileToClient({
      fileId: String(req.params.id),
      organisationId,
      folderKey,
      userId: req.auth!.id,
    });
    return res.status(200).json({
      success: true,
      data: result,
      message: result.created
        ? `Copied to ${result.organisation.name} · ${result.folder.name}`
        : `Updated in ${result.organisation.name} · ${result.folder.name}`,
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.post("/firm-staging/copy-to-client", async (req, res) => {
  try {
    const organisationId = String(req.body.organisationId || "");
    const folderKey = String(req.body.folderKey || "");
    const fileIds = Array.isArray(req.body.fileIds)
      ? (req.body.fileIds as unknown[]).map(String)
      : [];
    if (!organisationId || !folderKey) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "organisationId and folderKey are required",
        },
      });
    }
    const result = await copyFirmStagingFilesToClient({
      fileIds,
      organisationId,
      folderKey,
      userId: req.auth!.id,
    });
    if (result.copied === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: "COPY_FAILED",
          message: result.results[0]?.error || "Copy failed",
        },
        data: result,
      });
    }
    const dest =
      result.organisation && result.folder
        ? `${result.organisation.name} · ${result.folder.name}`
        : "client Documents";
    const message =
      result.failed > 0
        ? `Copied ${result.copied} · ${result.failed} failed → ${dest}`
        : result.copied === 1
          ? `Copied to ${dest}`
          : `Copied ${result.copied} files to ${dest}`;
    return res.status(200).json({
      success: true,
      data: result,
      message,
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

export default router;
