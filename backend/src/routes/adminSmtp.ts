import { Router } from "express";
import { z } from "zod";
import {
  getStoredSmtpConfig,
  publicSmtpSettings,
  sendMailWithConfig,
  type SmtpConfig,
} from "../lib/mail";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin, requirePasswordSettled } from "../middleware/auth";

const router = Router();
router.use(requireAuth, requireAdmin, requirePasswordSettled);

router.get("/smtp-settings", async (_req, res) => {
  const row = await prisma.smtpSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", fromDisplayName: "DM.HR Group" },
  });
  return res.status(200).json({
    success: true,
    data: { settings: publicSmtpSettings(row) },
  });
});

const patchSchema = z.object({
  host: z.string().nullable().optional(),
  port: z.number().int().min(1).max(65535).nullable().optional(),
  secure: z.boolean().optional(),
  username: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  fromAddress: z.string().email().nullable().optional().or(z.literal("")),
  fromDisplayName: z.string().nullable().optional(),
  clearPassword: z.boolean().optional(),
});

router.patch("/smtp-settings", async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message || "Invalid SMTP settings",
      },
    });
  }

  const data = parsed.data;
  const existing = await prisma.smtpSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", fromDisplayName: "DM.HR Group" },
  });

  const passwordUpdate =
    data.clearPassword === true
      ? { password: null }
      : data.password !== undefined && data.password !== null && data.password !== ""
        ? { password: data.password }
        : {};

  const fromAddress =
    data.fromAddress === undefined
      ? undefined
      : data.fromAddress === ""
        ? null
        : data.fromAddress;

  const row = await prisma.smtpSettings.update({
    where: { id: existing.id },
    data: {
      ...(data.host !== undefined ? { host: data.host || null } : {}),
      ...(data.port !== undefined ? { port: data.port } : {}),
      ...(data.secure !== undefined ? { secure: data.secure } : {}),
      ...(data.username !== undefined ? { username: data.username || null } : {}),
      ...(fromAddress !== undefined ? { fromAddress } : {}),
      ...(data.fromDisplayName !== undefined
        ? { fromDisplayName: data.fromDisplayName || null }
        : {}),
      ...passwordUpdate,
    },
  });

  return res.status(200).json({
    success: true,
    data: { settings: publicSmtpSettings(row) },
    message: "SMTP settings saved",
  });
});

const testSchema = z.object({
  to: z.string().email().optional(),
  /** saved = DB settings; form = values from the Settings form (password may fall back to saved). */
  source: z.enum(["saved", "form"]).default("saved"),
  host: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  fromAddress: z.string().email().optional().or(z.literal("")),
  fromDisplayName: z.string().optional(),
});

router.post("/smtp-settings/test", async (req, res) => {
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

  const data = parsed.data;
  const to = data.to || req.auth!.email;
  const stored = await getStoredSmtpConfig();

  let config: SmtpConfig | null = null;

  if (data.source === "form") {
    const password = data.password?.trim() || stored?.password || "";
    config = {
      host: (data.host || "").trim(),
      port: data.port ?? (data.secure ? 465 : 587),
      secure: Boolean(data.secure),
      username: (data.username || "").trim(),
      password,
      fromAddress: (data.fromAddress || "").trim(),
      fromDisplayName: data.fromDisplayName || "DM.HR Group",
    };
  } else {
    config = stored;
  }

  if (!config) {
    return res.status(400).json({
      success: false,
      error: {
        code: "SMTP_INCOMPLETE",
        message:
          "SMTP is not saved yet — fill host, username, password, and from address, then Save or use Test form",
      },
    });
  }

  const result = await sendMailWithConfig(config, {
    to: [to],
    subject: "DM.HR Portal — SMTP test email",
    text: [
      "This is a product test email from the DM.HR Group client portal.",
      "",
      "If you received this, SMTP is working and invite / notify emails can use these settings.",
      "",
      `Test source: ${data.source === "form" ? "current form values" : "saved settings in database"}`,
      `Sent at: ${new Date().toISOString()}`,
      "",
      "— DM.HR Group portal",
    ].join("\n"),
  });

  if (result.status === "skipped") {
    return res.status(400).json({
      success: false,
      error: { code: "SMTP_INCOMPLETE", message: result.reason },
    });
  }
  if (result.status === "failed") {
    return res.status(502).json({
      success: false,
      error: {
        code: "SMTP_FAILED",
        message: `SMTP send failed: ${result.reason}`,
      },
    });
  }

  return res.status(200).json({
    success: true,
    data: { to, source: data.source },
    message: `Test email sent to ${to}`,
  });
});

export default router;
