export type AccessCredentialsPayload = {
  organisationId: string;
  organisationName: string;
  clientEmail: string;
  clientName: string;
  authMode: "invite" | "temporary_password" | string;
  purpose?: "invite" | "reset" | string;
  inviteUrl: string | null;
  temporaryPassword: string | null;
  mailStatus: "sent" | "skipped" | "failed" | string;
  createdAt: string;
};

const STORAGE_KEY = "dmhr.accessCredentials";

export const storeAccessCredentials = (payload: AccessCredentialsPayload): void => {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
};

export const readAccessCredentials = (
  organisationId?: string
): AccessCredentialsPayload | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AccessCredentialsPayload;
    if (organisationId && parsed.organisationId !== organisationId) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const clearAccessCredentials = (): void => {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};

export const mailStatusLabel = (status: string): string => {
  if (status === "sent") return "Email sent to the client";
  if (status === "failed") return "Email failed — share manually below";
  return "SMTP not configured — share manually below";
};
