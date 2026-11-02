import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin, requirePasswordSettled } from "../middleware/auth";
import { singleUpload } from "../middleware/upload";
import {
  handleDelete,
  handleDownload,
  handleGetUploadSettings,
  handleListDocuments,
  handleListFolders,
  handlePatchUploadSettings,
  handleRename,
  handleUpload,
  handleVersions,
} from "./documentsShared";

const router = Router();

router.use(requireAuth, requireAdmin, requirePasswordSettled);

const orgIdSchema = z.string().uuid();

async function resolveOrg(organisationId: string) {
  return prisma.organisation.findUnique({ where: { id: organisationId } });
}

router.get("/upload-settings", async (_req, res) => {
  return handleGetUploadSettings(res);
});

router.patch("/upload-settings", async (req, res) => {
  return handlePatchUploadSettings(req, res);
});

router.get("/organisations/:organisationId/folders", async (req, res) => {
  const organisationId = req.params.organisationId;
  if (!orgIdSchema.safeParse(organisationId).success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid organisation id" },
    });
  }
  const org = await resolveOrg(organisationId);
  if (!org) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Organisation not found" },
    });
  }
  return handleListFolders(organisationId, res);
});

router.get("/organisations/:organisationId/folders/:folderId/documents", async (req, res) => {
  const { organisationId, folderId } = req.params;
  if (!orgIdSchema.safeParse(organisationId).success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid organisation id" },
    });
  }
  return handleListDocuments(organisationId, folderId, res);
});

router.post("/organisations/:organisationId/folders/:folderId/documents", (req, res) => {
  const { organisationId, folderId } = req.params;
  if (!orgIdSchema.safeParse(organisationId).success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid organisation id" },
    });
  }

  singleUpload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        error: { code: "UPLOAD_ERROR", message: err.message || "Upload failed" },
      });
    }
    const org = await resolveOrg(organisationId);
    if (!org) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Organisation not found" },
      });
    }
    return handleUpload(req, res, organisationId, folderId);
  });
});

router.get("/organisations/:organisationId/documents/:documentId/versions", async (req, res) => {
  const { organisationId, documentId } = req.params;
  if (!orgIdSchema.safeParse(organisationId).success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid organisation id" },
    });
  }
  return handleVersions(organisationId, documentId, res);
});

router.get("/organisations/:organisationId/documents/:documentId/download", async (req, res) => {
  const { organisationId, documentId } = req.params;
  if (!orgIdSchema.safeParse(organisationId).success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid organisation id" },
    });
  }
  return handleDownload(organisationId, documentId, req, res);
});

router.patch("/organisations/:organisationId/documents/:documentId", async (req, res) => {
  const { organisationId, documentId } = req.params;
  if (!orgIdSchema.safeParse(organisationId).success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid organisation id" },
    });
  }
  return handleRename(organisationId, documentId, req, res);
});

router.delete("/organisations/:organisationId/documents/:documentId", async (req, res) => {
  const { organisationId, documentId } = req.params;
  if (!orgIdSchema.safeParse(organisationId).success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid organisation id" },
    });
  }
  return handleDelete(organisationId, documentId, res);
});

export default router;
