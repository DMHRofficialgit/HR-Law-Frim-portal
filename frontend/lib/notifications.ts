import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Briefcase,
  ClipboardCheck,
  FileText,
  PenLine,
} from "lucide-react";

export type PortalNotification = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationKind =
  | "case"
  | "signature"
  | "onboarding"
  | "document"
  | "other";

export type NotificationFilter = "unread" | "all";

export function countUnread(items: PortalNotification[]): number {
  return items.filter((n) => !n.readAt).length;
}

export function inferNotificationKind(n: {
  title: string;
  href?: string | null;
  body?: string;
}): NotificationKind {
  const href = (n.href || "").toLowerCase();
  const text = `${n.title} ${n.body || ""}`.toLowerCase();

  if (
    href.includes("/cases") ||
    href.includes("/case") ||
    text.includes("case") ||
    text.includes("employment case")
  ) {
    return "case";
  }
  if (
    href.includes("/signatures") ||
    href.includes("signature") ||
    text.includes("signature") ||
    text.includes("ready to sign") ||
    text.includes("fully signed") ||
    text.includes("signed_returned") ||
    (text.includes("reviewed") && text.includes("sign"))
  ) {
    return "signature";
  }
  if (
    href.includes("/onboarding") ||
    text.includes("onboarding") ||
    text.includes("welcome")
  ) {
    return "onboarding";
  }
  if (
    href.includes("/documents") ||
    href.includes("document") ||
    text.includes("document") ||
    text.includes("published")
  ) {
    return "document";
  }
  return "other";
}

export function notificationKindLabel(kind: NotificationKind): string {
  switch (kind) {
    case "case":
      return "Case";
    case "signature":
      return "Signature";
    case "onboarding":
      return "Onboarding";
    case "document":
      return "Document";
    default:
      return "Alert";
  }
}

export function notificationKindIcon(kind: NotificationKind): LucideIcon {
  switch (kind) {
    case "case":
      return Briefcase;
    case "signature":
      return PenLine;
    case "onboarding":
      return ClipboardCheck;
    case "document":
      return FileText;
    default:
      return Bell;
  }
}

/** Compact relative time for activity feeds. */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 45) return "Just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
