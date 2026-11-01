import nodemailer from "nodemailer";
import { prisma } from "./prisma";

export type MailPayload = {
  to: string[];
  subject: string;
  text: string;
};

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromAddress: string;
  fromDisplayName?: string | null;
};

export type MailSendResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

export async function getStoredSmtpConfig(): Promise<SmtpConfig | null> {
  const smtp = await prisma.smtpSettings.findUnique({ where: { id: "default" } });
  if (!smtp?.host || !smtp.fromAddress || !smtp.username || !smtp.password) {
    return null;
  }
  return {
    host: smtp.host,
    port: smtp.port ?? (smtp.secure ? 465 : 587),
    secure: smtp.secure,
    username: smtp.username,
    password: smtp.password,
    fromAddress: smtp.fromAddress,
    fromDisplayName: smtp.fromDisplayName,
  };
}

export function validateSmtpConfig(config: Partial<SmtpConfig>): string | null {
  if (!config.host?.trim()) return "SMTP host is required";
  if (!config.username?.trim()) return "SMTP username is required";
  if (!config.password?.trim()) return "SMTP password is required";
  if (!config.fromAddress?.trim()) return "From address is required";
  const port = config.port ?? (config.secure ? 465 : 587);
  if (!Number.isFinite(port) || port < 1 || port > 65535) return "SMTP port is invalid";
  return null;
}

export async function sendMailWithConfig(
  config: SmtpConfig,
  payload: MailPayload
): Promise<MailSendResult> {
  const invalid = validateSmtpConfig(config);
  if (invalid) return { status: "skipped", reason: invalid };

  const recipients = [...new Set(payload.to.map((t) => t.trim()).filter(Boolean))];
  if (recipients.length === 0) {
    return { status: "skipped", reason: "No recipient email provided" };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.host.trim(),
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.username.trim(),
        pass: config.password,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });

    await transporter.verify();

    const from = config.fromDisplayName
      ? `"${config.fromDisplayName}" <${config.fromAddress.trim()}>`
      : config.fromAddress.trim();

    await transporter.sendMail({
      from,
      to: recipients.join(", "),
      subject: payload.subject,
      text: payload.text,
    });
    return { status: "sent" };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[mail:failed]", {
      subject: payload.subject,
      message: reason,
    });
    return { status: "failed", reason };
  }
}

/** In-app notifies / product mail — uses saved DB SMTP settings. */
export async function sendMail(payload: MailPayload): Promise<"sent" | "skipped" | "failed"> {
  const config = await getStoredSmtpConfig();
  if (!config) return "skipped";
  const result = await sendMailWithConfig(config, payload);
  return result.status;
}

export function publicSmtpSettings(row: {
  host: string | null;
  port: number | null;
  secure: boolean;
  username: string | null;
  password: string | null;
  fromAddress: string | null;
  fromDisplayName: string | null;
  updatedAt: Date;
}) {
  return {
    host: row.host,
    port: row.port,
    secure: row.secure,
    username: row.username,
    fromAddress: row.fromAddress,
    fromDisplayName: row.fromDisplayName,
    hasPassword: Boolean(row.password),
    updatedAt: row.updatedAt,
  };
}
