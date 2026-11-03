import { prisma } from "./prisma";

export type EmailTemplateTokens = Record<string, string | null | undefined>;

export type EmailTemplateDefault = {
  key: string;
  name: string;
  audience: string;
  groupName: string;
  subject: string;
  body: string;
};

/** Built-in copy — also used for Reset to default. */
export const EMAIL_TEMPLATE_DEFAULTS: readonly EmailTemplateDefault[] = [
  {
    key: "invite",
    name: "Invite — set password",
    audience: "Client / user",
    groupName: "Access",
    subject: "Set your DM.HR Group portal password{{org_bit}}",
    body: `Hi {{recipient_name}},

Your DM.HR Group client portal account is ready{{org_bit}}.

Use this secure link to set your password:
{{invite_link}}

If the link expires, ask your DM.HR adviser to resend the invite.

Login page: {{login_url}}

— DM.HR Group`,
  },
  {
    key: "temp_password",
    name: "Temporary password",
    audience: "Client / user",
    groupName: "Access",
    subject: "Your DM.HR Group portal temporary password{{org_bit}}",
    body: `Hi {{recipient_name}},

Your DM.HR Group client portal account is ready{{org_bit}}.

Sign in with:
Email: {{email}}
Temporary password: {{temporary_password}}

You will be asked to change this password on first login.
Login page: {{login_url}}

— DM.HR Group`,
  },
  {
    key: "password_reset",
    name: "Password reset",
    audience: "Client / user",
    groupName: "Access",
    subject: "Reset your DM.HR Group portal password{{org_bit}}",
    body: `Hi {{recipient_name}},

A password reset was requested for your DM.HR Group portal account{{org_bit}}.

Use this secure link to choose a new password:
{{invite_link}}

If you did not ask for this, contact your DM.HR adviser.

Login page: {{login_url}}

— DM.HR Group`,
  },
  {
    key: "welcome_default",
    name: "Welcome email (default)",
    audience: "Client",
    groupName: "Onboarding",
    subject: "Welcome to DM.HR Group | Your Client Onboarding",
    body: `Hello {{recipient_name}},

Welcome to DM.HR Group. We look forward to supporting {{org_name}}.

Please sign in to the client portal to review your onboarding checklist in My Onboarding, complete any documents that require your signature, and follow the payment links when they are provided.

Portal: {{portal_link}}

Kind regards,
DM.HR Group`,
  },
  {
    key: "onboarding_started",
    name: "Onboarding started",
    audience: "Client",
    groupName: "Onboarding",
    subject: "Welcome — onboarding started",
    body: `Your onboarding with DM.HR Group has started. Open My Onboarding to continue.

{{portal_link}}`,
  },
  {
    key: "onboarding_pack",
    name: "Onboarding documents ready",
    audience: "Client",
    groupName: "Onboarding",
    subject: "Onboarding documents ready",
    body: `{{detail}}

{{portal_link}}`,
  },
  {
    key: "onboarding_complete",
    name: "Onboarding complete",
    audience: "Client",
    groupName: "Onboarding",
    subject: "Onboarding complete",
    body: `{{org_name}} is now a full DM.HR client. Thank you.

{{portal_link}}`,
  },
  {
    key: "case_opened_client",
    name: "New case opened",
    audience: "Client",
    groupName: "Cases",
    subject: "New employment case opened",
    body: `{{case_ref}}: {{case_title}}

{{portal_link}}`,
  },
  {
    key: "case_opened_admin",
    name: "New case submitted",
    audience: "Admin",
    groupName: "Cases",
    subject: "New employment case submitted",
    body: `{{case_ref}}: {{case_title}}

{{portal_link}}`,
  },
  {
    key: "case_status_updated",
    name: "Case status updated",
    audience: "Client",
    groupName: "Cases",
    subject: "Case status updated",
    body: `{{case_ref}}: {{status}}

{{portal_link}}`,
  },
  {
    key: "case_update",
    name: "Case update",
    audience: "Client",
    groupName: "Cases",
    subject: "Case update",
    body: `{{case_ref}}: new update from DMHR

{{portal_link}}`,
  },
  {
    key: "case_client_reply",
    name: "Client replied on case",
    audience: "Admin",
    groupName: "Cases",
    subject: "Client replied on case",
    body: `{{case_ref}}: {{detail}}

{{portal_link}}`,
  },
  {
    key: "esign_ready",
    name: "Document ready to sign",
    audience: "Assignees / CC",
    groupName: "E-sign",
    subject: "Document ready to sign",
    body: `"{{document_title}}" {{detail}}

{{portal_link}}`,
  },
  {
    key: "esign_fully_signed",
    name: "Document fully signed",
    audience: "Admin",
    groupName: "E-sign",
    subject: "Document fully signed",
    body: `"{{document_title}}" was completed by all assignees.

{{portal_link}}`,
  },
  {
    key: "esign_reviewed",
    name: "Signature reviewed",
    audience: "Client",
    groupName: "E-sign",
    subject: "Signature reviewed",
    body: `"{{document_title}}" has been marked complete. A signed copy is now in Documents.

{{portal_link}}`,
  },
  {
    key: "esign_revision",
    name: "Signature revision requested",
    audience: "Assignees",
    groupName: "E-sign",
    subject: "Signature revision requested",
    body: `{{detail}}

{{portal_link}}`,
  },
  {
    key: "document_new_client",
    name: "Document available / updated",
    audience: "Client",
    groupName: "Documents",
    subject: "{{subject_line}}",
    body: `{{detail}}

{{portal_link}}`,
  },
  {
    key: "document_new_admin",
    name: "Client document upload",
    audience: "Admin",
    groupName: "Documents",
    subject: "{{subject_line}}",
    body: `{{detail}}

{{portal_link}}`,
  },
  {
    key: "smtp_test",
    name: "SMTP test email",
    audience: "Admin test",
    groupName: "Ops",
    subject: "DM.HR Portal — SMTP test email",
    body: `This is a product test email from the DM.HR Group client portal.

If you received this, SMTP is working and invite / notify emails can use these settings.

Test source: {{detail}}
Sent at: {{sent_at}}

— DM.HR Group portal`,
  },
] as const;

export function applyEmailTokens(
  template: string,
  tokens: EmailTemplateTokens
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const raw = tokens[key];
    if (raw === null || raw === undefined) return "";
    return String(raw);
  });
}

export async function ensureEmailTemplatesSeeded(): Promise<void> {
  for (const d of EMAIL_TEMPLATE_DEFAULTS) {
    await prisma.emailTemplate.upsert({
      where: { key: d.key },
      create: {
        key: d.key,
        name: d.name,
        audience: d.audience,
        groupName: d.groupName,
        subject: d.subject,
        body: d.body,
        active: true,
      },
      update: {},
    });
  }
}

export async function listEmailTemplates() {
  await ensureEmailTemplatesSeeded();
  return prisma.emailTemplate.findMany({ orderBy: [{ groupName: "asc" }, { name: "asc" }] });
}

export async function getEmailTemplateByKey(key: string) {
  await ensureEmailTemplatesSeeded();
  return prisma.emailTemplate.findUnique({ where: { key } });
}

export async function renderEmailTemplate(
  key: string,
  tokens: EmailTemplateTokens
): Promise<{ subject: string; body: string } | null> {
  const row = await getEmailTemplateByKey(key);
  const fallback = EMAIL_TEMPLATE_DEFAULTS.find((d) => d.key === key);
  const subjectSrc = row?.active !== false && row ? row.subject : fallback?.subject;
  const bodySrc = row?.active !== false && row ? row.body : fallback?.body;
  if (!subjectSrc || !bodySrc) return null;
  return {
    subject: applyEmailTokens(subjectSrc, tokens).trim() || fallback?.subject || key,
    body: applyEmailTokens(bodySrc, tokens).trim(),
  };
}

export async function updateEmailTemplate(
  key: string,
  data: { subject?: string; body?: string; active?: boolean; name?: string }
) {
  await ensureEmailTemplatesSeeded();
  const existing = await prisma.emailTemplate.findUnique({ where: { key } });
  if (!existing) return null;
  return prisma.emailTemplate.update({
    where: { key },
    data: {
      ...(data.subject !== undefined ? { subject: data.subject } : {}),
      ...(data.body !== undefined ? { body: data.body } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
    },
  });
}

export async function resetEmailTemplate(key: string) {
  const fallback = EMAIL_TEMPLATE_DEFAULTS.find((d) => d.key === key);
  if (!fallback) return null;
  await ensureEmailTemplatesSeeded();
  return prisma.emailTemplate.update({
    where: { key },
    data: {
      name: fallback.name,
      audience: fallback.audience,
      groupName: fallback.groupName,
      subject: fallback.subject,
      body: fallback.body,
      active: true,
    },
  });
}

/** Common portal link helper for notify templates. */
export function portalHrefLink(frontendUrl: string, href?: string | null): string {
  if (!href) return frontendUrl;
  if (href.startsWith("http")) return href;
  return `${frontendUrl.replace(/\/$/, "")}${href.startsWith("/") ? href : `/${href}`}`;
}

/** Sample tokens for Admin “Send test” / View preview. */
export const SAMPLE_EMAIL_TOKENS: EmailTemplateTokens = {
  recipient_name: "Alex Client",
  org_name: "Example Care Ltd",
  org_bit: " for Example Care Ltd",
  email: "alex@example.com",
  invite_link: "https://portal.example/set-password?token=sample",
  login_url: "https://portal.example/login",
  temporary_password: "TempPass123!",
  portal_link: "https://portal.example/portal",
  case_ref: "CASE-2026-0001",
  case_title: "Grievance — sample matter",
  status: "under review",
  detail: "Sample detail line for preview.",
  document_title: "Terms of Business",
  subject_line: "New document available",
  sent_at: new Date().toISOString(),
};

export async function previewEmailTemplate(
  key: string,
  overrides?: { subject?: string; body?: string }
): Promise<{ subject: string; body: string } | null> {
  const tokens = {
    ...SAMPLE_EMAIL_TOKENS,
    sent_at: new Date().toISOString(),
  };
  if (overrides?.subject !== undefined && overrides?.body !== undefined) {
    return {
      subject: applyEmailTokens(overrides.subject, tokens).trim(),
      body: applyEmailTokens(overrides.body, tokens).trim(),
    };
  }
  return renderEmailTemplate(key, tokens);
}
