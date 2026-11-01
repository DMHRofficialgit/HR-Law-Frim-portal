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
  const greeting = params.recipientName ? `Hi ${params.recipientName},` : "Hello,";
  const purpose = params.purpose || "invite";

  if (params.authMode === "invite" && params.inviteUrl) {
    if (purpose === "reset") {
      const subject = `Reset your DM.HR Group portal password${orgBit}`;
      const text = `${greeting}

A password reset was requested for your DM.HR Group portal account${orgBit}.

Use this secure link to choose a new password:
${params.inviteUrl}

If you did not ask for this, contact your DM.HR adviser.

Login page: ${params.loginUrl}

— DM.HR Group`;
      return sendMail({ to: [to], subject, text });
    }

    const subject = `Set your DM.HR Group portal password${orgBit}`;
    const text = `${greeting}

Your DM.HR Group client portal account is ready${orgBit}.

Use this secure link to set your password:
${params.inviteUrl}

If the link expires, ask your DM.HR adviser to resend the invite.

Login page: ${params.loginUrl}

— DM.HR Group`;
    return sendMail({ to: [to], subject, text });
  }

  if (params.authMode === "temporary_password" && params.temporaryPassword) {
    const subject = `Your DM.HR Group portal temporary password${orgBit}`;
    const text = `${greeting}

Your DM.HR Group client portal account is ready${orgBit}.

Sign in with:
Email: ${to}
Temporary password: ${params.temporaryPassword}

You will be asked to change this password on first login.
Login page: ${params.loginUrl}

— DM.HR Group`;
    return sendMail({ to: [to], subject, text });
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
