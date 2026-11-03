import { renderEmailTemplate } from "./emailTemplates";
import { sendMail } from "./mail";

export type AccessMailStatus = "sent" | "skipped" | "failed";

export type AccessMailPurpose = "invite" | "reset";

export type AccessMailParams = {
  to: string;
  recipientName: string;
  organisationName?: string | null;
  authMode: "invite" | "temporary_password";
  purpose?: AccessMailPurpose;
  inviteUrl?: string | null;
  temporaryPassword?: string | null;
  loginUrl: string;
};

export async function sendAccessCredentialsMail(
  params: AccessMailParams
): Promise<AccessMailStatus> {
  const to = params.to.trim().toLowerCase();
  if (!to) return "skipped";

  const orgBit = params.organisationName
    ? ` for ${params.organisationName}`
    : "";
  const recipientName = params.recipientName?.trim() || "there";
  const purpose = params.purpose || "invite";
  const baseTokens = {
    recipient_name: recipientName,
    org_name: params.organisationName || "",
    org_bit: orgBit,
    login_url: params.loginUrl,
    email: to,
    invite_link: params.inviteUrl || "",
    temporary_password: params.temporaryPassword || "",
  };

  if (params.authMode === "invite" && params.inviteUrl) {
    const key = purpose === "reset" ? "password_reset" : "invite";
    const rendered = await renderEmailTemplate(key, baseTokens);
    if (!rendered) return "skipped";
    return sendMail({ to: [to], subject: rendered.subject, text: rendered.body });
  }

  if (params.authMode === "temporary_password" && params.temporaryPassword) {
    const rendered = await renderEmailTemplate("temp_password", baseTokens);
    if (!rendered) return "skipped";
    return sendMail({ to: [to], subject: rendered.subject, text: rendered.body });
  }

  return "skipped";
}

export function accessMailMessage(
  status: AccessMailStatus,
  authMode: string,
  purpose: AccessMailPurpose = "invite"
): string {
  if (status === "sent") {
    if (authMode === "temporary_password") return "Temporary password email sent";
    return purpose === "reset" ? "Password reset email sent" : "Invite email sent";
  }
  if (status === "failed") {
    return "Email failed — check SMTP settings; credentials still shown below for manual share";
  }
  return "SMTP not configured — credentials shown for manual share (Admin → Settings → Email)";
}
