import { env } from "../config/env";
import {
  portalHrefLink,
  renderEmailTemplate,
  type EmailTemplateTokens,
} from "./emailTemplates";
import { prisma } from "./prisma";
import { sendMail } from "./mail";

/** Event groups that users can mute for email (in-app always created). */
export type NotifyEmailGroup = "cases" | "documents" | "signatures" | "onboarding";

const EMAIL_PREF_FIELD: Record<
  NotifyEmailGroup,
  "emailCases" | "emailDocuments" | "emailSignatures" | "emailOnboarding"
> = {
  cases: "emailCases",
  documents: "emailDocuments",
  signatures: "emailSignatures",
  onboarding: "emailOnboarding",
};

export type NotificationPrefsShape = {
  emailCases: boolean;
  emailDocuments: boolean;
  emailSignatures: boolean;
  emailOnboarding: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefsShape = {
  emailCases: true,
  emailDocuments: true,
  emailSignatures: true,
  emailOnboarding: true,
};

export async function getNotificationPrefs(
  userId: string
): Promise<NotificationPrefsShape> {
  const row = await prisma.notificationPreference.findUnique({
    where: { userId },
  });
  if (!row) return { ...DEFAULT_NOTIFICATION_PREFS };
  return {
    emailCases: row.emailCases,
    emailDocuments: row.emailDocuments,
    emailSignatures: row.emailSignatures,
    emailOnboarding: row.emailOnboarding,
  };
}

export async function upsertNotificationPrefs(
  userId: string,
  prefs: Partial<NotificationPrefsShape>
): Promise<NotificationPrefsShape> {
  const current = await getNotificationPrefs(userId);
  const next: NotificationPrefsShape = {
    emailCases: prefs.emailCases ?? current.emailCases,
    emailDocuments: prefs.emailDocuments ?? current.emailDocuments,
    emailSignatures: prefs.emailSignatures ?? current.emailSignatures,
    emailOnboarding: prefs.emailOnboarding ?? current.emailOnboarding,
  };
  await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...next },
    update: next,
  });
  return next;
}

async function userIdsAllowingEmail(
  userIds: string[],
  group: NotifyEmailGroup
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const field = EMAIL_PREF_FIELD[group];
  const rows = await prisma.notificationPreference.findMany({
    where: { userId: { in: userIds } },
    select: {
      userId: true,
      emailCases: true,
      emailDocuments: true,
      emailSignatures: true,
      emailOnboarding: true,
    },
  });
  const byUser = new Map(rows.map((r) => [r.userId, r]));
  return userIds.filter((id) => {
    const row = byUser.get(id);
    if (!row) return true;
    return row[field] !== false;
  });
}

const DEFAULT_CASES_NOTIFY_EMAIL = "case@dmhrgroup.com";

/** Shared DM.HR cases inbox (SMTP setting, else default case@…). */
export async function getCasesNotifyEmails(): Promise<string[]> {
  const row = await prisma.smtpSettings.findUnique({ where: { id: "default" } });
  const raw = (row?.casesNotifyEmail || DEFAULT_CASES_NOTIFY_EMAIL).trim().toLowerCase();
  return raw ? [raw] : [];
}

/** In-app notification + optional SMTP (never hard-code mailbox). */
export async function notifyUsers(params: {
  userIds: string[];
  organisationId?: string | null;
  title: string;
  body: string;
  href?: string;
  /** When set, email is skipped for users who opted out of this group. In-app always. */
  emailGroup?: NotifyEmailGroup;
  /** When set, subject/body come from Admin Email templates (+ tokens). */
  templateKey?: string;
  tokens?: EmailTemplateTokens;
  /**
   * Extra addresses always emailed (ignore user prefs / in-app).
   * Used for shared inbox e.g. case@dmhrgroup.com.
   */
  extraEmails?: string[];
}) {
  const unique = [...new Set(params.userIds.filter(Boolean))];
  const extraEmails = [
    ...new Set(
      (params.extraEmails || [])
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];

  let title = params.title;
  let body = params.body;

  if (params.templateKey) {
    const rendered = await renderEmailTemplate(params.templateKey, {
      ...(params.tokens || {}),
      portal_link: portalHrefLink(env.FRONTEND_URL, params.href),
    });
    if (rendered) {
      title = rendered.subject;
      body = rendered.body;
    }
  }

  if (unique.length > 0) {
    await prisma.notification.createMany({
      data: unique.map((userId) => ({
        userId,
        organisationId: params.organisationId || null,
        title,
        body,
        href: params.href || null,
      })),
    });
  }

  const mailUserIds =
    unique.length === 0
      ? []
      : params.emailGroup
        ? await userIdsAllowingEmail(unique, params.emailGroup)
        : unique;

  const users =
    mailUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: mailUserIds } },
          select: { email: true },
        })
      : [];

  const emails = [
    ...new Set([
      ...users.map((u) => u.email.trim().toLowerCase()).filter(Boolean),
      ...extraEmails,
    ]),
  ];

  if (emails.length === 0) {
    if (unique.length > 0) {
      console.info("[mail:skipped:prefs]", { title, group: params.emailGroup });
    }
    return;
  }

  const link = params.href ? portalHrefLink(env.FRONTEND_URL, params.href) : "";

  const result = await sendMail({
    to: emails,
    subject: title,
    text: `${body}${link && !body.includes(link) ? `\n\nOpen: ${link}` : ""}`,
  });

  if (result === "skipped") {
    console.info("[mail:skipped:no-smtp]", { title, toCount: emails.length });
  } else if (result === "sent") {
    console.info("[mail:sent]", { title, toCount: emails.length, extra: extraEmails.length });
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
