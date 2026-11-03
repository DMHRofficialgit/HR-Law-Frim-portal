import type { LucideIcon } from "lucide-react";
import {
  Bell,
  FolderArchive,
  ListTree,
  Mail,
  Server,
  UserRound,
} from "lucide-react";

export type AdminSettingsTab =
  | "templates"
  | "smtp"
  | "storage"
  | "categories"
  | "account";

export type AdminSettingsTabDef = {
  id: AdminSettingsTab;
  label: string;
  icon: LucideIcon;
};

export const ADMIN_SETTINGS_TABS: readonly AdminSettingsTabDef[] = [
  { id: "templates", label: "Email templates", icon: Mail },
  { id: "smtp", label: "Email / SMTP", icon: Server },
  { id: "storage", label: "Storage", icon: FolderArchive },
  { id: "categories", label: "Categories", icon: ListTree },
  { id: "account", label: "Account", icon: UserRound },
] as const;

export const DEFAULT_ADMIN_SETTINGS_TAB: AdminSettingsTab = "smtp";

export function parseAdminSettingsTab(
  raw: string | null | undefined
): AdminSettingsTab {
  const id = (raw || "").trim().toLowerCase();
  const match = ADMIN_SETTINGS_TABS.find((t) => t.id === id);
  return match?.id ?? DEFAULT_ADMIN_SETTINGS_TAB;
}

/** Catalog for Phase A placeholder + Phase C seed keys. */
export type EmailTemplateCatalogItem = {
  key: string;
  name: string;
  audience: string;
  group: "Access" | "Onboarding" | "Cases" | "E-sign" | "Documents" | "Ops";
};

export type ClientSettingsTab = "account" | "notifications";

export type ClientSettingsTabDef = {
  id: ClientSettingsTab;
  label: string;
  icon: LucideIcon;
};

export const CLIENT_SETTINGS_TABS: readonly ClientSettingsTabDef[] = [
  { id: "account", label: "Account", icon: UserRound },
  { id: "notifications", label: "Notifications", icon: Bell },
] as const;

export const DEFAULT_CLIENT_SETTINGS_TAB: ClientSettingsTab = "account";

export function parseClientSettingsTab(
  raw: string | null | undefined
): ClientSettingsTab {
  const id = (raw || "").trim().toLowerCase();
  const match = CLIENT_SETTINGS_TABS.find((t) => t.id === id);
  return match?.id ?? DEFAULT_CLIENT_SETTINGS_TAB;
}

export type NotificationPrefs = {
  emailCases: boolean;
  emailDocuments: boolean;
  emailSignatures: boolean;
  emailOnboarding: boolean;
};

export const NOTIFY_PREF_ROWS: readonly {
  key: keyof NotificationPrefs;
  label: string;
  hint: string;
}[] = [
  {
    key: "emailCases",
    label: "Case updates",
    hint: "Email when cases are opened, updated, or replied to.",
  },
  {
    key: "emailDocuments",
    label: "Document updates",
    hint: "Email when documents are uploaded or updated in your folders.",
  },
  {
    key: "emailSignatures",
    label: "Signature requests",
    hint: "Email for e-sign send, review, and revision alerts.",
  },
  {
    key: "emailOnboarding",
    label: "Onboarding",
    hint: "Email for onboarding start, pack ready, and complete.",
  },
] as const;

export const EMAIL_TEMPLATE_CATALOG: readonly EmailTemplateCatalogItem[] = [
  { key: "invite", name: "Invite — set password", audience: "Client / user", group: "Access" },
  { key: "temp_password", name: "Temporary password", audience: "Client / user", group: "Access" },
  { key: "password_reset", name: "Password reset", audience: "Client / user", group: "Access" },
  { key: "welcome_default", name: "Welcome email (default)", audience: "Client", group: "Onboarding" },
  { key: "onboarding_started", name: "Onboarding started", audience: "Client", group: "Onboarding" },
  { key: "onboarding_pack", name: "Onboarding documents ready", audience: "Client", group: "Onboarding" },
  { key: "onboarding_complete", name: "Onboarding complete", audience: "Client", group: "Onboarding" },
  { key: "case_opened_client", name: "New case opened", audience: "Client", group: "Cases" },
  { key: "case_opened_admin", name: "New case submitted", audience: "Admin", group: "Cases" },
  { key: "case_status_updated", name: "Case status updated", audience: "Client", group: "Cases" },
  { key: "case_update", name: "Case update", audience: "Client", group: "Cases" },
  { key: "case_client_reply", name: "Client replied on case", audience: "Admin", group: "Cases" },
  { key: "esign_ready", name: "Document ready to sign", audience: "Assignees / CC", group: "E-sign" },
  { key: "esign_fully_signed", name: "Document fully signed", audience: "Admin", group: "E-sign" },
  { key: "esign_reviewed", name: "Signature reviewed", audience: "Client", group: "E-sign" },
  { key: "esign_revision", name: "Signature revision requested", audience: "Assignees", group: "E-sign" },
  { key: "document_new_client", name: "Document available / updated", audience: "Client", group: "Documents" },
  { key: "document_new_admin", name: "Client document upload", audience: "Admin", group: "Documents" },
  { key: "smtp_test", name: "SMTP test email", audience: "Admin test", group: "Ops" },
] as const;
