"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { apiFetch, type PublicUser } from "../lib/api";
import { clearSession, getToken } from "../lib/auth";

type NavItem = {
  href: string;
  label: string;
  soon?: boolean;
};

type AppShellProps = {
  user: PublicUser;
  nav: NavItem[];
  title?: string;
  children: ReactNode;
};

export function AppShell({ user, nav, title, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnread = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const result = await apiFetch<{ unreadCount: number }>("/notifications/unread-count", {
      token,
    });
    if (result.success) setUnreadCount(result.data.unreadCount);
  }, []);

  useEffect(() => {
    loadUnread();
    const timer = window.setInterval(loadUnread, 30000);
    const onFocus = () => loadUnread();
    const onChanged = () => loadUnread();
    window.addEventListener("focus", onFocus);
    window.addEventListener("dmhr:notifications-changed", onChanged);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("dmhr:notifications-changed", onChanged);
    };
  }, [loadUnread, pathname]);

  function logout() {
    clearSession();
    router.replace("/login");
  }

  return (
    <div className="shell">
      <aside className="shell-sidebar">
        <div className="shell-brand">
          <img src="/logo/dmhr_transparent_logo.png" alt="DMHR Group" className="shell-logo" />
          <div>
            <div className="shell-brand-name">DMHR Group</div>
            <div className="shell-brand-sub">{user.role === "admin" ? "Admin" : "Client portal"}</div>
          </div>
        </div>

        <nav className="shell-nav">
          {nav.map((item) => {
            // Exact match for section roots like /portal or /admin (avoid marking Home active on every page)
            const active =
              pathname === item.href ||
              (item.href !== "/portal" &&
                item.href !== "/admin" &&
                pathname.startsWith(`${item.href}/`));
            const isNotifications = item.href.endsWith("/notifications");
            if (item.soon) {
              return (
                <span key={item.href} className="shell-nav-item soon" title="Coming in a later part">
                  {item.label}
                  <em>Soon</em>
                </span>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shell-nav-item${active ? " active" : ""}`}
              >
                <span>{item.label}</span>
                {isNotifications && unreadCount > 0 ? (
                  <em className="nav-badge">{unreadCount > 99 ? "99+" : unreadCount}</em>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="shell-user">
          <div className="shell-user-name">{user.name}</div>
          <div className="shell-user-email">{user.email}</div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="shell-main">
        <header className="shell-top">
          <h1>{title || "Portal"}</h1>
        </header>
        <div className="shell-content">{children}</div>
      </div>
    </div>
  );
}
