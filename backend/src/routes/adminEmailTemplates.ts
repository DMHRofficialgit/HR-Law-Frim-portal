import { Router } from "express";
import { z } from "zod";
import {
  EMAIL_TEMPLATE_DEFAULTS,
  getEmailTemplateByKey,
  listEmailTemplates,
  previewEmailTemplate,
  resetEmailTemplate,
  updateEmailTemplate,
} from "../lib/emailTemplates";
import { sendMail } from "../lib/mail";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin, requirePasswordSettled } from "../middleware/auth";

const router = Router();
router.use(requireAuth, requireAdmin, requirePasswordSettled);

const patchSchema = z.object({
  subject: z.string().min(1).max(500).optional(),
  body: z.string().min(1).max(20000).optional(),
  active: z.boolean().optional(),
  name: z.string().trim().min(1).max(200).optional(),
});

const testSchema = z.object({
  to: z.string().email().optional(),
  /** Send draft from editor without saving first. */
  subject: z.string().min(1).max(500).optional(),
  body: z.string().min(1).max(20000).optional(),
});

router.get("/email-templates", async (_req, res) => {
  const templates = await listEmailTemplates();
  return res.status(200).json({
    success: true,
    data: {
      templates,
      tokensHint: [
        "recipient_name",
        "org_name",
        "org_bit",
        "email",
        "invite_link",
        "login_url",
        "temporary_password",
        "portal_link",
        "case_ref",
        "case_title",
        "status",
        "detail",
        "document_title",
        "subject_line",
        "sent_at",
      ],
    },
  });
});

router.get("/email-templates/:key", async (req, res) => {
  const template = await getEmailTemplateByKey(req.params.key);
  if (!template) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Template not found" },
    });
  }
  const fallback = EMAIL_TEMPLATE_DEFAULTS.find((d) => d.key === template.key);
  return res.status(200).json({
    success: true,
    data: { template, defaultSubject: fallback?.subject, defaultBody: fallback?.body },
  });
});

router.patch("/email-templates/:key", async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message || "Invalid template payload",
      },
    });
  }
  const template = await updateEmailTemplate(req.params.key, parsed.data);
  if (!template) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Template not found" },
    });
  }
  return res.status(200).json({
    success: true,
    data: { template },
    message: "Template saved",
  });
});

router.post("/email-templates/:key/reset", async (req, res) => {
  const template = await resetEmailTemplate(req.params.key);
  if (!template) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Template not found" },
    });
  }
  return res.status(200).json({
    success: true,
    data: { template },
    message: "Template reset to default",
  });
});

/** Send a sample-token preview of this template via SMTP. */
router.post("/email-templates/:key/test", async (req, res) => {
  const parsed = testSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message || "Invalid test payload",
      },
    });
  }

  const existing = await getEmailTemplateByKey(req.params.key);
  if (!existing && !EMAIL_TEMPLATE_DEFAULTS.some((d) => d.key === req.params.key)) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Template not found" },
    });
  }

  const admin = await prisma.user.findUnique({
    where: { id: req.auth!.id },
    select: { email: true },
  });
  const to = (parsed.data.to || admin?.email || "").trim().toLowerCase();
  if (!to) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Test recipient email is required" },
    });
  }

  const draft =
    parsed.data.subject && parsed.data.body
      ? { subject: parsed.data.subject, body: parsed.data.body }
      : undefined;
  const rendered = await previewEmailTemplate(req.params.key, draft);
  if (!rendered) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Template could not be rendered" },
    });
  }

  const result = await sendMail({
    to: [to],
    subject: `[TEST] ${rendered.subject}`,
    text: `${rendered.body}\n\n—\nThis is a template test from Admin Settings (sample tokens).`,
  });

  if (result === "skipped") {
    return res.status(400).json({
      success: false,
      error: {
        code: "SMTP_INCOMPLETE",
        message: "SMTP is not configured — save Email / SMTP settings first",
      },
    });
  }
  if (result === "failed") {
    return res.status(502).json({
      success: false,
      error: { code: "SMTP_FAILED", message: "SMTP send failed — check settings" },
    });
  }

  return res.status(200).json({
    success: true,
    data: { to, subject: rendered.subject },
    message: `Test email sent to ${to}`,
  });
});

export default router;
