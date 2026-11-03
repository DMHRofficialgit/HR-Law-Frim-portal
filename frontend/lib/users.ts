export type PortalUserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  organisationId?: string | null;
  mustChangePassword?: boolean;
  passwordChangedAt?: string | null;
  organisation?: { id: string; name: string } | null;
};

export type UserKpiKey = "all" | "admins" | "company" | "needs_access";

export type ClientUserKpiKey = "all" | "needs_access" | "active";

export type UserCreateCredentials = {
  user: PortalUserRow;
  inviteUrl: string | null;
  temporaryPassword: string | null;
  authMode: string;
  mailStatus?: string;
  purpose?: string;
};

export function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function userRoleLabel(role: string): string {
  if (role === "admin") return "Admin";
  if (role === "client") return "Company user";
  return role.replace(/_/g, " ");
}

export function userStatusLabel(status: string): string {
  if (status === "active") return "Active";
  if (status === "disabled") return "Disabled";
  return status.replace(/_/g, " ");
}

export function userStatusPillTone(status: string): "active" | "inactive" {
  return status === "active" ? "active" : "inactive";
}

export function userAccessLabel(u: PortalUserRow): string {
  if (u.role === "admin") return "All portal clients and settings";
  return u.organisation?.name || "—";
}

/** Invite pending or must change password after temp login. */
export function userNeedsAccess(u: PortalUserRow): boolean {
  if (u.status !== "active") return false;
  if (u.mustChangePassword) return true;
  return !u.passwordChangedAt;
}

export function userAccessActionLabel(u: PortalUserRow): string {
  return u.passwordChangedAt ? "Password reset" : "Resend invite";
}

export function userMatchesKpi(u: PortalUserRow, kpi: UserKpiKey): boolean {
  if (kpi === "all") return true;
  if (kpi === "admins") return u.role === "admin";
  if (kpi === "company") return u.role === "client";
  if (kpi === "needs_access") return userNeedsAccess(u);
  return true;
}

export function countUsersByKpi(users: PortalUserRow[]): Record<UserKpiKey, number> {
  return {
    all: users.length,
    admins: users.filter((u) => u.role === "admin").length,
    company: users.filter((u) => u.role === "client").length,
    needs_access: users.filter((u) => userNeedsAccess(u)).length,
  };
}

export function clientUserMatchesKpi(u: PortalUserRow, kpi: ClientUserKpiKey): boolean {
  if (kpi === "all") return true;
  if (kpi === "needs_access") return userNeedsAccess(u);
  if (kpi === "active") return u.status === "active";
  return true;
}

export function countClientUsersByKpi(
  users: PortalUserRow[]
): Record<ClientUserKpiKey, number> {
  return {
    all: users.length,
    needs_access: users.filter((u) => userNeedsAccess(u)).length,
    active: users.filter((u) => u.status === "active").length,
  };
}
