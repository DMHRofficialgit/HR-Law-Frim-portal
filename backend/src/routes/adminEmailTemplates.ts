import { Router } from "express";
import { z } from "zod";
import {
  containsDmHrBrand,
  DM_HR_BRAND_EMAIL_HINT,
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
import { recordAuditFromReq } from "../services/audit";

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
  const result = await updateEmailTemplate(req.params.key, parsed.data);
  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : 400;
    return res.status(status).json({
      success: false,
      error: { code: result.code, message: result.message },
    });
  }
  void recordAuditFromReq(req, {
    action: "settings.template_update",
    entityType: "email_template",
    entityId: result.template.key,
    summary: `Updated email template “${result.template.name}”`,
  });
  return res.status(200).json({
    success: true,
    data: { template: result.template },
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
  void recordAuditFromReq(req, {
    action: "settings.template_update",
    entityType: "email_template",
    entityId: template.key,
    summary: `Reset email template “${template.name}”`,
    meta: { reset: true },
  });
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

  if (
    (parsed.data.subject && containsDmHrBrand(parsed.data.subject)) ||
    (parsed.data.body && containsDmHrBrand(parsed.data.body))
  ) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: DM_HR_BRAND_EMAIL_HINT },
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

  void recordAuditFromReq(req, {
    action: "settings.template_test",
    entityType: "email_template",
    entityId: req.params.key,
    summary: `Sent test for email template “${req.params.key}”`,
    meta: { to },
  });

  return res.status(200).json({
    success: true,
    data: { to, subject: rendered.subject },
    message: `Test email sent to ${to}`,
  });
});

export default router;
