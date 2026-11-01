import nodemailer from "nodemailer";
import { prisma } from "./prisma";

export type MailPayload = {
  to: string[];
  subject: string;
  text: string;
};

export async function sendMail(payload: MailPayload): Promise<"sent" | "skipped" | "failed"> {
  const smtp = await prisma.smtpSettings.findUnique({ where: { id: "default" } });
  if (!smtp?.host || !smtp.fromAddress || !smtp.username || !smtp.password) {
    return "skipped";
  }

  const recipients = [...new Set(payload.to.filter(Boolean))];
  if (recipients.length === 0) return "skipped";

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port ?? (smtp.secure ? 465 : 587),
      secure: smtp.secure,
      auth: {
        user: smtp.username,
        pass: smtp.password,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });

    const from = smtp.fromDisplayName
      ? `"${smtp.fromDisplayName}" <${smtp.fromAddress}>`
      : smtp.fromAddress;

    await transporter.sendMail({
      from,
      to: recipients.join(", "),
      subject: payload.subject,
      text: payload.text,
    });
    return "sent";
  } catch (err) {
    console.error("[mail:failed]", {
      subject: payload.subject,
      message: err instanceof Error ? err.message : String(err),
    });
    return "failed";
  }
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
