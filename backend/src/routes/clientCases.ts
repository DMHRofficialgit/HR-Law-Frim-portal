import { Router } from "express";
import { MessageVisibility } from "@prisma/client";
import { z } from "zod";
import { sendStoredFile } from "../lib/send-stored-file";
import { clientOrgId, requireAuth, requireClient, requirePasswordSettled } from "../middleware/auth";
import {
  consumeUploadedFile,
  discardUploadedFiles,
  multiUpload as makeMultiUpload,
} from "../middleware/upload";
import { uploadConcurrencyLimiter } from "../middleware/uploadConcurrency";
import {
  addCaseMessage,
  createCase,
  deleteCaseAttachment,
  filterCaseForClient,
  getCase,
  getCaseAttachment,
  isCaseAttachmentClientVisible,
  listCases,
  updateCase,
} from "../services/cases";
import { prisma } from "../lib/prisma";

const router = Router();
router.use(requireAuth, requireClient, requirePasswordSettled);

const multiUpload = makeMultiUpload("files", 5);

router.get("/case-categories", async (_req, res) => {
  const categories = await prisma.caseCategory.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
  return res.status(200).json({ success: true, data: { categories } });
});

router.get("/cases", async (req, res) => {
  const cases = await listCases(clientOrgId(req));
  return res.status(200).json({ success: true, data: { cases } });
});

router.get("/cases/:id", async (req, res) => {
  const c = await getCase(req.params.id, clientOrgId(req));
  if (!c) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Case not found" },
    });
  }
  return res.status(200).json({ success: true, data: { case: filterCaseForClient(c) } });
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
      organisationId: clientOrgId(req),
      userId: req.auth!.id,
      title: parsed.data.title,
      description: parsed.data.description,
      categoryId: parsed.data.categoryId,
      categoryOther: parsed.data.categoryOther || null,
      employeeId: parsed.data.employeeId || null,
      peopleInvolved: parsed.data.peopleInvolved || null,
      investigation: parsed.data.investigation || null,
      outcome: parsed.data.outcome || null,
      createdByRole: "client",
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
      data: { case: filterCaseForClient(result.case!) },
      message: "Case submitted",
    });
  });
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
    organisationId: clientOrgId(req),
    actorUserId: req.auth!.id,
    actorRole: "client",
    title: parsed.data.title,
    description: parsed.data.description,
    categoryId: parsed.data.categoryId,
    categoryOther: parsed.data.categoryOther,
    employeeId:
      parsed.data.employeeId === undefined
        ? undefined
        : parsed.data.employeeId || null,
    peopleInvolved: parsed.data.peopleInvolved,
  });

  if ("error" in result && result.error) {
    return res.status(result.error.status).json({
      success: false,
      error: { code: result.error.code, message: result.error.message },
    });
  }

  return res.status(200).json({
    success: true,
    data: { case: filterCaseForClient(result.case!) },
    message: "Case updated",
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

    const rawFiles = (req.files as Express.Multer.File[]) || [];
    const files = await Promise.all(rawFiles.map((f) => consumeUploadedFile(f)));

    const result = await addCaseMessage({
      caseId: String(req.params.id),
      organisationId: clientOrgId(req),
      userId: req.auth!.id,
      body,
      visibility: MessageVisibility.client_visible,
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
      data: { case: filterCaseForClient(result.case!) },
      message: "Reply posted",
    });
  });
});

router.get("/case-attachments/:id/download", async (req, res) => {
  const orgId = clientOrgId(req);
  const allowed = await isCaseAttachmentClientVisible(req.params.id, orgId);
  if (!allowed) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Attachment not found" },
    });
  }
  const att = await getCaseAttachment(req.params.id, orgId);
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

/** Client may delete only their own uploads (wrong-file fix); never private-note files. */
router.delete("/case-attachments/:id", async (req, res) => {
  const orgId = clientOrgId(req);
  const allowed = await isCaseAttachmentClientVisible(req.params.id, orgId);
  if (!allowed) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Attachment not found" },
    });
  }
  const deleted = await deleteCaseAttachment(req.params.id, {
    organisationId: orgId,
    uploadedById: req.auth!.id,
  });
  if (!deleted) {
    return res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Attachment not found or you can only remove files you uploaded",
      },
    });
  }
  return res.status(200).json({
    success: true,
    data: { id: deleted.id },
    message: "File removed",
  });
});

export default router;
