import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Briefcase,
  Building2,
  ClipboardCheck,
  FolderOpen,
  Home,
  LayoutDashboard,
  Library,
  PenLine,
  Settings,
  UserCog,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";

export type NavGroup = "home" | "clients" | "workspace" | "system";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  group?: NavGroup;
  soon?: boolean;
};

/** Sidebar section labels (null = no heading above that block). */
export const NAV_GROUP_LABELS: Record<NavGroup, string | null> = {
  home: null,
  clients: "Clients",
  workspace: "Workspace",
  system: "System",
};

export const NAV_GROUP_ORDER: NavGroup[] = ["home", "clients", "workspace", "system"];

export const adminNav: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, group: "home" },
  { href: "/admin/organisations", label: "Organisations", icon: Building2, group: "clients" },
  { href: "/admin/documents", label: "Documents", icon: FolderOpen, group: "workspace" },
  { href: "/admin/firm-library", label: "Firm Library", icon: Library, group: "workspace" },
  { href: "/admin/employees", label: "Employees", icon: Users, group: "workspace" },
  { href: "/admin/cases", label: "Cases", icon: Briefcase, group: "workspace" },
  { href: "/admin/onboarding", label: "Onboarding", icon: ClipboardCheck, group: "workspace" },
  { href: "/admin/signatures", label: "Signatures", icon: PenLine, group: "workspace" },
  { href: "/admin/users", label: "Users", icon: UserCog, group: "system" },
  { href: "/admin/notifications", label: "Notifications", icon: Bell, group: "system" },
  { href: "/admin/settings", label: "Settings", icon: Settings, group: "system" },
  { href: "/admin/payments", label: "Payments", icon: Wallet, group: "system", soon: true },
];

export const clientNav: NavItem[] = [
  { href: "/portal", label: "Overview", icon: Home, group: "home" },
  { href: "/portal/documents", label: "Documents", icon: FolderOpen, group: "workspace" },
  { href: "/portal/employees", label: "Employees", icon: Users, group: "workspace" },
  { href: "/portal/onboarding", label: "Onboarding", icon: ClipboardCheck, group: "workspace" },
  { href: "/portal/cases", label: "Cases", icon: Briefcase, group: "workspace" },
  { href: "/portal/signatures", label: "Signatures", icon: PenLine, group: "workspace" },
  { href: "/portal/company-users", label: "Company Users", icon: UserPlus, group: "workspace" },
  { href: "/portal/notifications", label: "Notifications", icon: Bell, group: "system" },
  { href: "/portal/payments", label: "Payments", icon: Wallet, group: "system", soon: true },
];

export function breadcrumbsForPath(
  pathname: string,
  nav: NavItem[],
  pageTitle?: string
): { href?: string; label: string }[] {
  const root = pathname.startsWith("/admin") ? "/admin" : "/portal";
  const crumbs: { href?: string; label: string }[] = [
    { href: root, label: "DMHR Group" },
  ];

  const exact = nav.find((n) => n.href === pathname);
  if (exact) {
    crumbs.push({ label: exact.label });
    return crumbs;
  }

  const parent = [...nav]
    .filter((n) => n.href !== root && pathname.startsWith(`${n.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  if (parent) {
    crumbs.push({ href: parent.href, label: parent.label });
    if (pageTitle && pageTitle !== parent.label) {
      crumbs.push({ label: pageTitle });
    }
    return crumbs;
  }

  if (pageTitle) crumbs.push({ label: pageTitle });
  return crumbs;
}
