import { env } from "../config/env";
import { prisma } from "./prisma";
import { sendMail } from "./mail";

/** In-app notification + optional SMTP (never hard-code mailbox). */
export async function notifyUsers(params: {
  userIds: string[];
  organisationId?: string | null;
  title: string;
  body: string;
  href?: string;
}) {
  const unique = [...new Set(params.userIds.filter(Boolean))];
  if (unique.length === 0) return;

  await prisma.notification.createMany({
    data: unique.map((userId) => ({
      userId,
      organisationId: params.organisationId || null,
      title: params.title,
      body: params.body,
      href: params.href || null,
    })),
  });

  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { email: true },
  });
  const emails = users.map((u) => u.email);
  const link = params.href ? `${env.FRONTEND_URL}${params.href}` : "";

  const result = await sendMail({
    to: emails,
    subject: params.title,
    text: `${params.body}${link ? `\n\nOpen: ${link}` : ""}`,
  });

  if (result === "skipped") {
    console.info("[mail:skipped:no-smtp]", { title: params.title, toUserIds: unique });
  } else if (result === "sent") {
    console.info("[mail:sent]", { title: params.title, toCount: emails.length });
  }
}

export async function adminUserIds() {
  const admins = await prisma.user.findMany({
    where: { role: "admin", status: "active" },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}

export async function clientUserIdsForOrg(organisationId: string) {
  const clients = await prisma.user.findMany({
    where: { role: "client", status: "active", organisationId },
    select: { id: true },
  });
  return clients.map((c) => c.id);
}
