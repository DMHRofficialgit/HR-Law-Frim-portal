"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Bell,
  LogOut,
  Menu,
  Moon,
  PanelLeft,
  PanelLeftClose,
  Pin,
  PinOff,
  Sun,
  X,
} from "lucide-react";
import { IconButton } from "./IconButton";
import { PortalSearch } from "./PortalSearch";
import { TooltipAnchor } from "./TooltipAnchor";
import { apiFetch, type PublicUser } from "../lib/api";
import { clearSession, getToken } from "../lib/auth";
import {
  breadcrumbsForPath,
  NAV_GROUP_LABELS,
  NAV_GROUP_ORDER,
  type NavGroup,
  type NavItem,
} from "../lib/nav";
import {
  applyTheme,
  getStoredShellPinned,
  getStoredTheme,
  setStoredShellPinned,
  setTheme,
  type ThemeMode,
} from "../lib/theme";

type AppShellProps = {
  user: PublicUser;
  nav: NavItem[];
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function isNavActive(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href === "/portal" || href === "/admin") return false;
  return pathname.startsWith(`${href}/`);
}

export function AppShell({ user, nav, title, actions, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState<"rail" | "top" | "drawer" | null>(null);
  const [theme, setThemeState] = useState<ThemeMode>("light");
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const enterTimer = useRef<number | null>(null);
  const leaveTimer = useRef<number | null>(null);
  const menuId = useId();

  const expanded = pinned || hovered;

  function clearRailTimers() {
    if (enterTimer.current) {
      window.clearTimeout(enterTimer.current);
      enterTimer.current = null;
    }
    if (leaveTimer.current) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }
  const notificationsHref =
    user.role === "admin" ? "/admin/notifications" : "/portal/notifications";
  const crumbs = useMemo(
    () => breadcrumbsForPath(pathname, nav, title),
    [pathname, nav, title]
  );

  const loadUnread = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const result = await apiFetch<{ unreadCount: number }>("/notifications/unread-count", {
      token,
    });
    if (result.success) setUnreadCount(result.data.unreadCount);
  }, []);

  useEffect(() => {
    const mode = getStoredTheme();
    applyTheme(mode);
    setThemeState(mode);
    setPinned(getStoredShellPinned());
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

  useEffect(() => {
    setDrawerOpen(false);
    setMenuOpen(null);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      const t = e.target;
      if (!(t instanceof Element) || !t.closest(".shell-account")) setMenuOpen(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(null);
        setDrawerOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  useEffect(() => {
    return () => clearRailTimers();
  }, []);

  function logout() {
    clearSession();
    router.replace("/login");
  }

  function onThemeToggle() {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }

  function onPinToggle() {
    const next = !pinned;
    setPinned(next);
    setStoredShellPinned(next);
    clearRailTimers();
    if (next) setHovered(false);
    else setHovered(false);
  }

  function onRailEnter() {
    if (pinned) return;
    if (leaveTimer.current) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    if (hovered) return;
    enterTimer.current = window.setTimeout(() => {
      setHovered(true);
      enterTimer.current = null;
    }, 160);
  }

  function onRailLeave() {
    if (pinned) return;
    if (enterTimer.current) {
      window.clearTimeout(enterTimer.current);
      enterTimer.current = null;
    }
    leaveTimer.current = window.setTimeout(() => setHovered(false), 220);
  }

  const roleLabel = user.role === "admin" ? "Admin" : "Client portal";

  const navByGroup = useMemo(() => {
    const map = new Map<NavGroup, NavItem[]>();
    for (const group of NAV_GROUP_ORDER) map.set(group, []);
    for (const item of nav) {
      const group = item.group || "workspace";
      const list = map.get(group) || [];
      list.push(item);
      map.set(group, list);
    }
    return map;
  }, [nav]);

  function renderNavList(items: NavItem[], onNavigate?: () => void, rail?: boolean) {
    return items.map((item) => {
      const Icon = item.icon;
      const active = isNavActive(pathname, item.href);
      const isNotifications = item.href.endsWith("/notifications");
      const label = item.label;
      if (item.soon) {
        return (
          <span
            key={item.href}
            className="shell-nav-item soon"
            title={label}
          >
            <span className="shell-nav-item-main">
              <Icon className="shell-nav-icon" aria-hidden size={18} strokeWidth={1.75} />
              <span className="shell-nav-label">{label}</span>
            </span>
            {!rail || expanded ? <em className="shell-soon-chip">Soon</em> : null}
          </span>
        );
      }
      return (
        <Link
          key={item.href}
          href={item.href}
          className={`shell-nav-item${active ? " active" : ""}`}
          aria-current={active ? "page" : undefined}
          title={rail && !expanded ? label : undefined}
          onClick={onNavigate}
        >
          <span className="shell-nav-item-main">
            <Icon className="shell-nav-icon" aria-hidden size={18} strokeWidth={1.75} />
            <span className="shell-nav-label">{label}</span>
          </span>
          {isNotifications && unreadCount > 0 ? (
            <em className="nav-badge">{unreadCount > 99 ? "99+" : unreadCount}</em>
          ) : null}
        </Link>
      );
    });
  }

  function renderNav(onNavigate?: () => void, rail?: boolean) {
    const showLabels = !rail || expanded;
    const sections: ReactNode[] = [];
    let priorHadItems = false;

    for (const group of NAV_GROUP_ORDER) {
      const items = navByGroup.get(group) || [];
      if (!items.length) continue;
      const heading = NAV_GROUP_LABELS[group];

      if (priorHadItems) {
        if (showLabels && heading) {
          sections.push(
            <div key={`${group}-label`} className="shell-nav-group">
              {heading}
            </div>
          );
        } else if (rail && !expanded) {
          sections.push(
            <div key={`${group}-divider`} className="shell-nav-divider" aria-hidden />
          );
        } else if (showLabels && !heading) {
          sections.push(
            <div key={`${group}-divider`} className="shell-nav-divider" aria-hidden />
          );
        }
      } else if (showLabels && heading) {
        sections.push(
          <div key={`${group}-label`} className="shell-nav-group">
            {heading}
          </div>
        );
      }

      sections.push(
        <div key={`${group}-items`} className="shell-nav-section">
          {renderNavList(items, onNavigate, rail)}
        </div>
      );
      priorHadItems = true;
    }

    return (
      <nav className="shell-nav" aria-label="Main">
        {sections}
      </nav>
    );
  }

  function renderUserMenu(variant: "rail" | "top" | "drawer") {
    const compact = variant === "top" || (variant === "rail" && !expanded);
    const open = menuOpen === variant;
    return (
      <div
        className={`shell-account${compact ? " compact" : ""}${variant === "top" ? " top" : ""}`}
      >
        {compact ? (
          <TooltipAnchor label="Account" side="bottom">
            <button
              type="button"
              className="shell-icon-btn shell-avatar-btn"
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls={open ? menuId : undefined}
              aria-label={`Account · ${user.name}`}
              onClick={() => setMenuOpen((o) => (o === variant ? null : variant))}
            >
              <span className="shell-avatar" aria-hidden>
                {initials(user.name)}
              </span>
            </button>
          </TooltipAnchor>
        ) : (
          <button
            type="button"
            className="shell-icon-btn shell-avatar-btn"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={open ? menuId : undefined}
            onClick={() => setMenuOpen((o) => (o === variant ? null : variant))}
          >
            <span className="shell-avatar" aria-hidden>
              {initials(user.name)}
            </span>
            <span className="shell-account-meta">
              <span className="shell-user-name">{user.name}</span>
              <span className="shell-user-email">{user.email}</span>
            </span>
          </button>
        )}
        {open ? (
          <div id={menuId} className="shell-account-menu" role="menu">
            <div className="shell-account-menu-head">
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
            <button
              type="button"
              className="shell-account-menu-item"
              role="menuitem"
              onClick={logout}
            >
              <LogOut size={16} strokeWidth={1.75} aria-hidden />
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`shell${expanded ? " shell-expanded" : " shell-collapsed"}${
        pinned ? " shell-pinned" : ""
      }`}
    >
      <aside
        className="shell-sidebar"
        aria-label="Sidebar"
        onMouseEnter={onRailEnter}
        onMouseLeave={onRailLeave}
      >
        <div className="shell-brand">
          <img src="/logo/dmhr_transparent_logo.png" alt="" className="shell-logo" />
          <div className="shell-brand-text">
            <div className="shell-brand-name">DMHR Group</div>
            <div className="shell-brand-sub">{roleLabel}</div>
          </div>
        </div>
        {renderNav(undefined, true)}
        <div className="shell-sidebar-foot">
          <div className="shell-foot-pin-row">
            <button
              type="button"
              className={`shell-pin-btn${pinned ? " pinned" : ""}`}
              aria-pressed={pinned}
              aria-label={pinned ? "Unpin sidebar" : "Pin sidebar open"}
              title={pinned ? "Unpin sidebar" : "Pin sidebar open"}
              onClick={onPinToggle}
            >
              {pinned ? (
                <PinOff size={16} strokeWidth={1.75} aria-hidden />
              ) : (
                <Pin size={16} strokeWidth={1.75} aria-hidden />
              )}
              <span className="shell-nav-label">{pinned ? "Unpin" : "Pin open"}</span>
            </button>
          </div>
          {renderUserMenu("rail")}
        </div>
      </aside>

      {drawerOpen ? (
        <div className="shell-drawer-root">
          <button
            type="button"
            className="shell-drawer-backdrop"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="shell-drawer" aria-label="Mobile navigation">
            <div className="shell-drawer-head">
              <div className="shell-brand">
                <img src="/logo/dmhr_transparent_logo.png" alt="" className="shell-logo" />
                <div className="shell-brand-text">
                  <div className="shell-brand-name">DMHR Group</div>
                  <div className="shell-brand-sub">{roleLabel}</div>
                </div>
              </div>
              <IconButton label="Close menu" onClick={() => setDrawerOpen(false)}>
                <X size={20} strokeWidth={1.75} />
              </IconButton>
            </div>
            {renderNav(() => setDrawerOpen(false), false)}
            <div className="shell-sidebar-foot">{renderUserMenu("drawer")}</div>
          </aside>
        </div>
      ) : null}

      <div className="shell-main">
        <header className="shell-top">
          <div className="shell-top-left">
            <IconButton
              label="Open menu"
              className="shell-menu-toggle"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu size={20} strokeWidth={1.75} />
            </IconButton>
            <IconButton
              label={pinned ? "Collapse sidebar" : "Expand sidebar"}
              aria-label={pinned ? "Collapse sidebar" : "Expand and pin sidebar"}
              className="shell-desktop-pin"
              side="bottom"
              onClick={onPinToggle}
            >
              {pinned ? (
                <PanelLeftClose size={18} strokeWidth={1.75} />
              ) : (
                <PanelLeft size={18} strokeWidth={1.75} />
              )}
            </IconButton>
            <nav className="shell-breadcrumbs" aria-label="Breadcrumb">
              {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1;
                return (
                  <span key={`${c.label}-${i}`} className="shell-crumb">
                    {i > 0 ? <span className="shell-crumb-sep">/</span> : null}
                    {c.href && !last ? (
                      <Link href={c.href} className="shell-crumb-link">
                        {c.label}
                      </Link>
                    ) : (
                      <span className={`shell-crumb-current${last ? " current" : ""}`}>
                        {c.label}
                      </span>
                    )}
                  </span>
                );
              })}
            </nav>
          </div>
          <div className="shell-top-right">
            <PortalSearch
              mode="shell"
              nav={nav}
              role={user.role === "admin" ? "admin" : "client"}
            />
            {actions ? <div className="shell-top-actions">{actions}</div> : null}
            <IconButton
              label={theme === "dark" ? "Light mode" : "Dark mode"}
              aria-label={
                theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
              }
              side="bottom"
              onClick={onThemeToggle}
            >
              {theme === "dark" ? (
                <Sun size={18} strokeWidth={1.75} />
              ) : (
                <Moon size={18} strokeWidth={1.75} />
              )}
            </IconButton>
            <IconButton
              href={notificationsHref}
              label="Notifications"
              aria-label={
                unreadCount > 0
                  ? `Notifications, ${unreadCount} unread`
                  : "Notifications"
              }
              side="bottom"
            >
              <Bell size={18} strokeWidth={1.75} />
              {unreadCount > 0 ? (
                <span className="shell-icon-badge">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </IconButton>
            <div className="shell-top-account">{renderUserMenu("top")}</div>
          </div>
        </header>
        <div className="shell-content">
          {title ? <h1 className="shell-page-title">{title}</h1> : null}
          {children}
        </div>
      </div>
    </div>
  );
}
