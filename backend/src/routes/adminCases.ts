import { Router } from "express";
import { CaseStatus, MessageVisibility } from "@prisma/client";
import { createReadStream } from "fs";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { absoluteStoragePath } from "../lib/storage";
import { requireAuth, requireAdmin, requirePasswordSettled } from "../middleware/auth";
import {
  addCaseMessage,
  deleteCase,
  getCase,
  getCaseAttachment,
  listCases,
  updateCaseStatus,
} from "../services/cases";

const router = Router();
router.use(requireAuth, requireAdmin, requirePasswordSettled);

const multiUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 5 },
}).array("files", 5);

router.get("/case-categories", async (_req, res) => {
  const categories = await prisma.caseCategory.findMany({ orderBy: { sortOrder: "asc" } });
  return res.status(200).json({ success: true, data: { categories } });
});

router.post("/case-categories", async (req, res) => {
  const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Name is required" },
    });
  }
  try {
    const category = await prisma.caseCategory.create({
      data: {
        name: parsed.data.name.trim(),
        isSystem: false,
        sortOrder: 200,
        active: true,
      },
    });
    return res.status(201).json({ success: true, data: { category }, message: "Category added" });
  } catch {
    return res.status(409).json({
      success: false,
      error: { code: "CONFLICT", message: "Category name already exists" },
    });
  }
});

router.patch("/case-categories/:id", async (req, res) => {
  const parsed = z
    .object({
      name: z.string().min(1).optional(),
      active: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid category payload" },
    });
  }
  try {
    const category = await prisma.caseCategory.update({
      where: { id: req.params.id },
      data: parsed.data,
    });
    return res.status(200).json({ success: true, data: { category } });
  } catch {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Category not found" },
    });
  }
});

router.get("/cases", async (req, res) => {
  const organisationId =
    typeof req.query.organisationId === "string" && req.query.organisationId.length > 0
      ? req.query.organisationId
      : undefined;
  const cases = await listCases(organisationId);
  return res.status(200).json({ success: true, data: { cases } });
});

router.get("/cases/:id", async (req, res) => {
  const c = await getCase(req.params.id);
  if (!c) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Case not found" },
    });
  }
  return res.status(200).json({ success: true, data: { case: c } });
});

router.patch("/cases/:id/status", async (req, res) => {
  const parsed = z
    .object({ status: z.nativeEnum(CaseStatus) })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid status" },
    });
  }
  const result = await updateCaseStatus({
    caseId: req.params.id,
    status: parsed.data.status,
    actorUserId: req.auth!.id,
  });
  if ("error" in result && result.error) {
    return res.status(result.error.status).json({
      success: false,
      error: { code: result.error.code, message: result.error.message },
    });
  }
  return res.status(200).json({ success: true, data: { case: result.case }, message: "Status updated" });
});

router.post("/cases/:id/messages", (req, res) => {
  multiUpload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        error: { code: "UPLOAD_ERROR", message: err.message || "Upload failed" },
      });
    }

    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (!body) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Message body is required" },
      });
    }

    const visibility =
      req.body?.visibility === "admin_only"
        ? MessageVisibility.admin_only
        : MessageVisibility.client_visible;

    const files = ((req.files as Express.Multer.File[]) || []).map((f) => ({
      originalName: f.originalname,
      mimeType: f.mimetype,
      size: f.size,
      buffer: f.buffer,
    }));

    const result = await addCaseMessage({
      caseId: req.params.id,
      userId: req.auth!.id,
      body,
      visibility,
      files,
    });

    if ("error" in result && result.error) {
      return res.status(result.error.status).json({
        success: false,
        error: { code: result.error.code, message: result.error.message },
      });
    }

    return res.status(201).json({
      success: true,
      data: { case: result.case },
      message: visibility === MessageVisibility.admin_only ? "Private note added" : "Update posted",
    });
  });
});

router.get("/case-attachments/:id/download", async (req, res) => {
  const att = await getCaseAttachment(req.params.id);
  if (!att) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Attachment not found" },
    });
  }
  res.setHeader("Content-Type", att.mimeType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(att.fileName)}"`
  );
  createReadStream(absoluteStoragePath(att.storagePath)).pipe(res);
});

router.delete("/cases/:id", async (req, res) => {
  const deleted = await deleteCase(req.params.id);
  if (!deleted) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Case not found" },
    });
  }
  return res.status(200).json({ success: true, data: { id: deleted.id }, message: "Case deleted" });
});

export default router;
