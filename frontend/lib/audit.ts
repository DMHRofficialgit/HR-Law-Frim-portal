import type { LucideIcon } from "lucide-react";
import {
  Ban,
  Briefcase,
  Building2,
  FileText,
  FolderOpen,
  KeyRound,
  Library,
  LogIn,
  PenLine,
  ScrollText,
  Settings,
  Shield,
  ShieldAlert,
  Trash2,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";

export type AuditEventRow = {
  id: string;
  createdAt: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  ip: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  organisationId: string | null;
  organisationName: string | null;
  summary: string;
  meta: unknown;
};

export type AuditPillTone = "ok" | "progress" | "warn" | "inactive" | "muted";

export type AuditCategory =
  | "all"
  | "auth"
  | "failures"
  | "workspace"
  | "system";

export type AuditActionMeta = {
  label: string;
  category: Exclude<AuditCategory, "all" | "failures"> | "workspace";
  Icon: LucideIcon;
  tone: AuditPillTone;
};

const ACTION_LABELS: Record<string, string> = {
  "auth.login_success": "Signed in",
  "auth.login_failure": "Login failed",
  "auth.logout": "Signed out",
  "auth.password_change": "Password changed",
  "auth.password_set": "Password set",
  "user.invite": "Invite sent",
  "user.reset_link": "Reset link sent",
  "user.disable": "User disabled",
  "user.enable": "User enabled",
  "document.upload": "Document uploaded",
  "document.download": "Document downloaded",
  "document.rename": "Document renamed",
  "document.delete": "Document deleted",
  "case.create": "Case created",
  "case.status_change": "Case status changed",
  "case.message": "Case message",
  "case.attachment_upload": "Case file uploaded",
  "case.attachment_download": "Case file downloaded",
  "case.attachment_delete": "Case file deleted",
  "case.archive": "Case archived",
  "case.restore": "Case restored",
  "case.purge": "Case purged",
  "organisation.create": "Organisation created",
  "organisation.update": "Organisation updated",
  "organisation.archive": "Organisation archived",
  "organisation.restore": "Organisation restored",
  "organisation.purge": "Organisation purged",
  "employee.create": "Employee created",
  "employee.update": "Employee updated",
  "employee.archive": "Employee archived",
  "employee.restore": "Employee restored",
  "employee.delete": "Employee deleted",
  "signature.create": "Signature request created",
  "signature.send": "Signature request sent",
  "signature.mark_ready": "Signature marked ready",
  "signature.sign": "Document signed",
  "signature.review": "Signature reviewed",
  "signature.revision": "Revision requested",
  "signature.reupload": "Signed file re-uploaded",
  "firm_library.upload": "Firm library upload",
  "firm_library.delete": "Firm library delete",
  "firm_staging.upload": "Firm staging upload",
  "firm_staging.delete": "Firm staging delete",
  "firm_staging.copy_to_client": "Staging copied to client",
  "settings.smtp_save": "SMTP settings saved",
  "settings.upload_save": "Upload settings saved",
  "settings.template_update": "Email template updated",
  "settings.template_test": "Email template test",
  "ops.archive_purge": "Archive purge ran",
  "ops.audit_retention_purge": "Audit retention purge",
};

const ACTION_ICONS: Partial<Record<string, LucideIcon>> = {
  "auth.login_success": LogIn,
  "auth.login_failure": ShieldAlert,
  "auth.logout": KeyRound,
  "auth.password_change": KeyRound,
  "auth.password_set": KeyRound,
  "user.invite": UserPlus,
  "user.reset_link": KeyRound,
  "user.disable": Ban,
  "user.enable": UserCog,
  "document.upload": FileText,
  "document.download": FileText,
  "document.rename": FileText,
  "document.delete": Trash2,
  "case.create": Briefcase,
  "case.status_change": Briefcase,
  "case.message": Briefcase,
  "case.attachment_upload": Briefcase,
  "case.attachment_download": Briefcase,
  "case.attachment_delete": Trash2,
  "case.archive": Briefcase,
  "case.restore": Briefcase,
  "case.purge": Trash2,
  "organisation.create": Building2,
  "organisation.update": Building2,
  "organisation.archive": Building2,
  "organisation.restore": Building2,
  "organisation.purge": Trash2,
  "employee.create": Users,
  "employee.update": Users,
  "employee.archive": Users,
  "employee.restore": Users,
  "employee.delete": Trash2,
  "signature.create": PenLine,
  "signature.send": PenLine,
  "signature.mark_ready": PenLine,
  "signature.sign": PenLine,
  "signature.review": PenLine,
  "signature.revision": PenLine,
  "signature.reupload": PenLine,
  "firm_library.upload": Library,
  "firm_library.delete": Trash2,
  "firm_staging.upload": FolderOpen,
  "firm_staging.delete": Trash2,
  "firm_staging.copy_to_client": FolderOpen,
  "settings.smtp_save": Settings,
  "settings.upload_save": Settings,
  "settings.template_update": Settings,
  "settings.template_test": Settings,
  "ops.archive_purge": Shield,
  "ops.audit_retention_purge": Shield,
};

export function auditActionLabel(action: string): string {
  return ACTION_LABELS[action] || action;
}

export const AUDIT_ACTION_OPTIONS = Object.keys(ACTION_LABELS)
  .sort()
  .map((value) => ({ value, label: ACTION_LABELS[value] }));

export function formatAuditTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function auditCategoryOf(action: string): AuditActionMeta["category"] {
  if (action.startsWith("auth.")) return "auth";
  if (action.startsWith("ops.") || action.startsWith("settings.")) return "system";
  return "workspace";
}

export function auditActionTone(action: string): AuditPillTone {
  if (
    action === "auth.login_failure" ||
    action.endsWith(".delete") ||
    action.endsWith(".purge") ||
    action === "user.disable" ||
    action === "ops.archive_purge" ||
    action === "ops.audit_retention_purge"
  ) {
    return "inactive";
  }
  if (
    action.endsWith(".archive") ||
    action === "signature.revision" ||
    action === "user.reset_link" ||
    action === "auth.password_change"
  ) {
    return "warn";
  }
  if (
    action === "auth.login_success" ||
    action === "auth.password_set" ||
    action === "user.enable" ||
    action.endsWith(".create") ||
    action.endsWith(".restore") ||
    action === "signature.sign" ||
    action === "signature.review"
  ) {
    return "ok";
  }
  if (action === "auth.logout" || action.endsWith(".download") || action.endsWith(".rename")) {
    return "muted";
  }
  return "progress";
}

export function auditActionIcon(action: string): LucideIcon {
  return ACTION_ICONS[action] || categoryFallbackIcon(auditCategoryOf(action));
}

const categoryFallbackIcon = (category: AuditActionMeta["category"]): LucideIcon => {
  switch (category) {
    case "auth":
      return KeyRound;
    case "system":
      return Shield;
    default:
      return ScrollText;
  }
};

export function auditActionMeta(action: string): AuditActionMeta {
  return {
    label: auditActionLabel(action),
    category: auditCategoryOf(action),
    Icon: auditActionIcon(action),
    tone: auditActionTone(action),
  };
}

export function auditActorInitials(email: string | null, role: string | null): string {
  if (!email) {
    if (role === "system") return "SY";
    return "—";
  }
  const local = email.split("@")[0] || email;
  const parts = local.split(/[._\-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

export function auditActorRoleLabel(role: string | null): string {
  if (!role) return "";
  if (role === "admin") return "Admin";
  if (role === "client") return "Company user";
  if (role === "system") return "System";
  return role.replace(/_/g, " ");
}

export function auditEntityHref(
  entityType: string,
  entityId: string | null,
  organisationId: string | null
): string | null {
  if (!entityId) {
    if (organisationId && (entityType === "organisation" || entityType === "document")) {
      return `/admin/organisations/${organisationId}`;
    }
    return null;
  }
  switch (entityType) {
    case "case":
      return `/admin/cases/${entityId}`;
    case "organisation":
      return `/admin/organisations/${entityId}`;
    case "employee":
      return `/admin/employees/${entityId}`;
    case "user":
      return `/admin/users`;
    case "document":
      return organisationId
        ? `/admin/organisations/${organisationId}?tab=documents`
        : null;
    default:
      return organisationId ? `/admin/organisations/${organisationId}` : null;
  }
}

export type AuditRangePreset = "all" | "24h" | "7d" | "30d";

export function auditRangeBounds(preset: AuditRangePreset): { from: string; to: string } {
  if (preset === "all") return { from: "", to: "" };
  const end = new Date();
  const start = new Date(end);
  if (preset === "24h") start.setHours(start.getHours() - 24);
  else if (preset === "7d") start.setDate(start.getDate() - 7);
  else start.setDate(start.getDate() - 30);
  const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);
  return { from: toIsoDate(start), to: toIsoDate(end) };
}
