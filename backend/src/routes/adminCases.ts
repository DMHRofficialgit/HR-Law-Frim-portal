import { Router } from "express";
import { CaseStatus, MessageVisibility } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { sendStoredFile } from "../lib/send-stored-file";
import { requireAuth, requireAdmin, requirePasswordSettled } from "../middleware/auth";
import {
  consumeUploadedFile,
  discardUploadedFiles,
  multiUpload as makeMultiUpload,
} from "../middleware/upload";
import { uploadConcurrencyLimiter } from "../middleware/uploadConcurrency";
import {
  addCaseMessage,
  archiveCase,
  bulkCases,
  createCase,
  deleteCase,
  deleteCaseAttachment,
  getCase,
  getCaseAttachment,
  listCases,
  restoreCase,
  updateCase,
  updateCaseStatus,
} from "../services/cases";
import { purgeExpiredArchives } from "../services/archive-purge";

const router = Router();
router.use(requireAuth, requireAdmin, requirePasswordSettled);

const multiUpload = makeMultiUpload("files", 5);

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
  const archived = String(req.query.archived || "") === "1";
  const cases = await listCases(organisationId, { archived });
  return res.status(200).json({ success: true, data: { cases } });
});

router.post("/cases/:id/archive", async (req, res) => {
  const c = await archiveCase(String(req.params.id));
  if (!c) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Case not found" },
    });
  }
  return res.status(200).json({
    success: true,
    data: { case: c },
    message: "Case archived — permanently removed after 30 days unless restored",
  });
});

router.post("/cases/:id/restore", async (req, res) => {
  const c = await restoreCase(String(req.params.id));
  if (!c) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Case not found" },
    });
  }
  return res.status(200).json({
    success: true,
    data: { case: c },
    message: "Case restored",
  });
});

router.post("/maintenance/purge-archives", async (_req, res) => {
  try {
    const result = await purgeExpiredArchives();
    return res.status(200).json({
      success: true,
      data: result,
      message: "Archive purge completed",
    });
  } catch (err) {
    const e = err as { message?: string };
    return res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: e.message || "Purge failed" },
    });
  }
});

router.post("/cases", uploadConcurrencyLimiter, (req, res) => {
  multiUpload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        error: { code: "UPLOAD_ERROR", message: err.message || "Upload failed" },
      });
    }

    const parsed = z
      .object({
        organisationId: z.string().uuid(),
        title: z.string().min(1),
        description: z.string().min(1),
        categoryId: z.string().uuid(),
        categoryOther: z.string().optional(),
        employeeId: z.union([z.string().uuid(), z.literal("")]).optional(),
        peopleInvolved: z.string().optional(),
        investigation: z.string().optional(),
        outcome: z.string().optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      await discardUploadedFiles(req.files as Express.Multer.File[]);
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message || "Invalid case payload",
        },
      });
    }

    const rawFiles = (req.files as Express.Multer.File[]) || [];
    const files = await Promise.all(rawFiles.map((f) => consumeUploadedFile(f)));

    const result = await createCase({
      organisationId: parsed.data.organisationId,
      title: parsed.data.title,
      description: parsed.data.description,
      categoryId: parsed.data.categoryId,
      categoryOther: parsed.data.categoryOther || null,
      employeeId: parsed.data.employeeId || null,
      peopleInvolved: parsed.data.peopleInvolved || null,
      investigation: parsed.data.investigation || null,
      outcome: parsed.data.outcome || null,
      userId: req.auth!.id,
      createdByRole: "admin",
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
      message: "Case created",
    });
  });
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

router.patch("/cases/:id", async (req, res) => {
  const parsed = z
    .object({
      title: z.string().min(1).optional(),
      description: z.string().min(1).optional(),
      categoryId: z.string().uuid().optional(),
      categoryOther: z.string().nullable().optional(),
      employeeId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
      peopleInvolved: z.string().nullable().optional(),
      investigation: z.string().nullable().optional(),
      outcome: z.string().nullable().optional(),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid case payload" },
    });
  }

  const result = await updateCase({
    caseId: req.params.id,
    actorUserId: req.auth!.id,
    actorRole: "admin",
    title: parsed.data.title,
    description: parsed.data.description,
    categoryId: parsed.data.categoryId,
    categoryOther: parsed.data.categoryOther,
    employeeId:
      parsed.data.employeeId === undefined
        ? undefined
        : parsed.data.employeeId || null,
    peopleInvolved: parsed.data.peopleInvolved,
    investigation: parsed.data.investigation,
    outcome: parsed.data.outcome,
  });

  if ("error" in result && result.error) {
    return res.status(result.error.status).json({
      success: false,
      error: { code: result.error.code, message: result.error.message },
    });
  }

  return res.status(200).json({
    success: true,
    data: { case: result.case },
    message: "Case updated",
  });
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

const bulkCaseSchema = z.object({
  action: z.enum(["close", "archive", "restore"]),
  ids: z.array(z.string().min(1)).min(1).max(50),
});

router.post("/cases/bulk", async (req, res) => {
  const parsed = bulkCaseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message || "Invalid bulk case payload",
      },
    });
  }

  const result = await bulkCases({
    action: parsed.data.action,
    ids: parsed.data.ids,
    actorUserId: req.auth!.id,
  });

  if (
    result.updated === 0 &&
    result.failed.length === 1 &&
    result.failed[0]?.code === "VALIDATION_ERROR"
  ) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: result.failed[0].message,
      },
    });
  }

  return res.status(200).json({
    success: true,
    data: result,
    message: `${parsed.data.action}: updated ${result.updated}, skipped ${result.skipped}, failed ${result.failed.length}`,
  });
});

router.post("/cases/:id/messages", uploadConcurrencyLimiter, (req, res) => {
  multiUpload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        error: { code: "UPLOAD_ERROR", message: err.message || "Upload failed" },
      });
    }

    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (!body) {
      await discardUploadedFiles(req.files as Express.Multer.File[]);
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Message body is required" },
      });
    }

    const visibility =
      req.body?.visibility === "admin_only"
        ? MessageVisibility.admin_only
        : MessageVisibility.client_visible;

    const rawFiles = (req.files as Express.Multer.File[]) || [];
    const files = await Promise.all(rawFiles.map((f) => consumeUploadedFile(f)));

    const result = await addCaseMessage({
      caseId: String(req.params.id),
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
  await sendStoredFile(res, att.storagePath, {
    mimeType: att.mimeType,
    fileName: att.fileName,
    disposition: "attachment",
  });
});

router.delete("/case-attachments/:id", async (req, res) => {
  const deleted = await deleteCaseAttachment(req.params.id);
  if (!deleted) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Attachment not found" },
    });
  }
  return res.status(200).json({
    success: true,
    data: { id: deleted.id },
    message: "File removed",
  });
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
