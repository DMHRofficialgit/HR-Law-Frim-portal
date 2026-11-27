import type { PublicUser } from "./api";

const TOKEN_KEY = "dmhr_token";
const REFRESH_KEY = "dmhr_refresh";
const USER_KEY = "dmhr_user";
const SESSION_META_KEY = "dmhr_session_meta";

export type SessionMeta = {
  absoluteExpiresAt: string;
  idleMinutes: number;
  accessTtlMinutes: number;
};

export type SaveSessionOptions = {
  refreshToken?: string;
  session?: SessionMeta;
};

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function getSessionMeta(): SessionMeta | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_META_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionMeta;
  } catch {
    return null;
  }
}

export function getStoredUser(): PublicUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PublicUser;
  } catch {
    return null;
  }
}

export function saveSession(
  token: string,
  user: PublicUser,
  options?: SaveSessionOptions
): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (options?.refreshToken) {
    localStorage.setItem(REFRESH_KEY, options.refreshToken);
  }
  if (options?.session) {
    localStorage.setItem(SESSION_META_KEY, JSON.stringify(options.session));
  }
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(SESSION_META_KEY);
}

let forcedSignOut = false;

/** True while we are sending the user to login after a dead session. */
export function isForcedSignOut(): boolean {
  return forcedSignOut;
}

/**
 * Clear local session and hard-redirect to login once.
 * Prevents parallel API failures from stacking “Invalid or expired token” toasts.
 */
export function forceSignOutToLogin(): void {
  if (typeof window === "undefined") return;
  if (forcedSignOut) return;
  forcedSignOut = true;
  clearSession();
  const path = window.location.pathname || "";
  if (path === "/login" || path.startsWith("/login/") || path.startsWith("/set-password")) {
    return;
  }
  window.location.replace("/login");
}

export function homeForUser(user: PublicUser): string {
  if (user.mustChangePassword) return "/change-password";
  if (user.role === "admin") return "/admin";
  return "/portal";
}

/** Decode JWT `exp` (seconds) without verifying — client scheduling only. */
export function accessTokenExpiresAtMs(token: string | null): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { exp?: number };
    if (typeof payload.exp !== "number") return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}
