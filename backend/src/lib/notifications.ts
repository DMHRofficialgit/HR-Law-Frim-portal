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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ORG_NOTIFY_EMAILS = 20;

/** Shared DMHR cases inbox (SMTP setting, else default case@…). */
export async function getCasesNotifyEmails(): Promise<string[]> {
  const row = await prisma.smtpSettings.findUnique({ where: { id: "default" } });
  const raw = (row?.casesNotifyEmail || DEFAULT_CASES_NOTIFY_EMAIL).trim().toLowerCase();
  return raw ? [raw] : [];
}

/** Split / normalize a stored or form CC list (invalid tokens dropped). */
export function parseNotifyEmails(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const parts = raw
    .split(/[,;\n\r]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(parts.filter((e) => EMAIL_RE.test(e)))].slice(
    0,
    MAX_ORG_NOTIFY_EMAILS
  );
}

/**
 * Validate + normalize org CC input for create/update.
 * Empty → null. Invalid address → error (do not save half-broken lists).
 */
export function normalizeNotifyEmailsInput(
  raw: string | null | undefined
): { ok: true; value: string | null } | { ok: false; message: string } {
  if (raw === null || raw === undefined || !String(raw).trim()) {
    return { ok: true, value: null };
  }
  const parts = String(raw)
    .split(/[,;\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length > MAX_ORG_NOTIFY_EMAILS) {
    return {
      ok: false,
      message: `At most ${MAX_ORG_NOTIFY_EMAILS} CC emails are allowed`,
    };
  }
  const invalid = parts.find((p) => !EMAIL_RE.test(p.toLowerCase()));
  if (invalid) {
    return { ok: false, message: `Invalid CC email: ${invalid}` };
  }
  const unique = [...new Set(parts.map((p) => p.toLowerCase()))];
  return { ok: true, value: unique.join(", ") };
}

/** Org-level CC emails (no login) for client-facing alerts. */
export async function getOrgNotifyEmails(organisationId: string): Promise<string[]> {
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { notifyEmails: true },
  });
  return parseNotifyEmails(org?.notifyEmails);
}

export function mergeExtraEmails(...lists: (string[] | undefined)[]): string[] {
  return [
    ...new Set(
      lists
        .flatMap((l) => l || [])
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

/**
 * FYI-only mail for org CC (no login). Uses `cc_alert` template — never appends a portal link.
 * Does not create in-app notifications.
 */
export async function notifyOrgCcAlert(params: {
  organisationId: string;
  detail: string;
  orgName?: string;
  emails?: string[];
}) {
  const emails =
    params.emails !== undefined
      ? [
          ...new Set(
            params.emails.map((e) => e.trim().toLowerCase()).filter(Boolean)
          ),
        ]
      : await getOrgNotifyEmails(params.organisationId);
  if (emails.length === 0) return;

  let orgName = params.orgName?.trim() || "";
  if (!orgName) {
    const org = await prisma.organisation.findUnique({
      where: { id: params.organisationId },
      select: { name: true },
    });
    orgName = org?.name || "your organisation";
  }

  const fallbackSubject = `Update for ${orgName}`;
  const fallbackBody = `${params.detail}

This is a notification only. You do not have a portal login for this organisation. Please ask your company's portal user to review the update in the DMHR portal.

— DMHR Group`;

  let subject = fallbackSubject;
  let body = fallbackBody;
  const rendered = await renderEmailTemplate("cc_alert", {
    org_name: orgName,
    detail: params.detail,
  });
  if (rendered) {
    subject = rendered.subject;
    body = rendered.body;
  }

  const result = await sendMail({ to: emails, subject, text: body });
  if (result === "skipped") {
    console.info("[mail:skipped:no-smtp]", { title: subject, toCount: emails.length, kind: "org_cc" });
  } else if (result === "sent") {
    console.info("[mail:sent]", { title: subject, toCount: emails.length, kind: "org_cc" });
  }
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
