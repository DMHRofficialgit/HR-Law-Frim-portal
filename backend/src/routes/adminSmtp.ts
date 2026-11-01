import { Router } from "express";
import { z } from "zod";
import { publicSmtpSettings, sendMail } from "../lib/mail";
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

router.post("/smtp-settings/test", async (req, res) => {
  const to = typeof req.body?.to === "string" ? req.body.to : req.auth!.email;
  const result = await sendMail({
    to: [to],
    subject: "DM.HR Portal SMTP test",
    text: "This is a test email from the DM.HR client portal SMTP settings.",
  });

  if (result === "skipped") {
    return res.status(400).json({
      success: false,
      error: {
        code: "SMTP_INCOMPLETE",
        message: "Fill host, username, password, and from address before testing",
      },
    });
  }
  if (result === "failed") {
    return res.status(502).json({
      success: false,
      error: { code: "SMTP_FAILED", message: "SMTP send failed — check host/credentials" },
    });
  }

  return res.status(200).json({
    success: true,
    data: { to },
    message: `Test email sent to ${to}`,
  });
});

export default router;
