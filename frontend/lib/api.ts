import {
  clearSession,
  forceSignOutToLogin,
  getRefreshToken,
  getToken,
  saveSession,
  type SessionMeta,
} from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export type ApiError = {
  success: false;
  error: { code: string; message: string };
};

export type ApiSuccess<T> = {
  success: true;
  data: T;
  message?: string;
};

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "client";
  organisationId: string | null;
  mustChangePassword: boolean;
  status: string;
};

export type AuthBundle = {
  token: string;
  refreshToken: string;
  user: PublicUser;
  session: SessionMeta;
};

export type FolderRow = {
  id: string;
  key: string;
  name: string;
  sortOrder: number;
  documentCount: number;
};

export type DocumentRow = {
  id: string;
  title: string;
  currentVersion: number;
  isSignedCopy?: boolean;
  signatureRequestId?: string | null;
  updatedAt: string;
  createdBy: { id: string; name: string; email: string } | null;
  latestVersion: {
    id: string;
    versionNumber: number;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
  } | null;
};

const NETWORK_ERROR: ApiError = {
  success: false,
  error: {
    code: "NETWORK_ERROR",
    message: "Unable to reach the API. Check that the backend is running.",
  },
};

const SESSION_ENDED: ApiError = {
  success: false,
  error: {
    code: "SESSION_ENDED",
    message: "Session ended — please sign in again",
  },
};

const SESSION_ENDED_CODES = new Set([
  "UNAUTHORIZED",
  "TOKEN_REVOKED",
  "SESSION_REVOKED",
  "SESSION_IDLE",
  "SESSION_ABSOLUTE",
  "SESSION_ENDED",
]);

async function parseJson<T>(res: Response): Promise<ApiSuccess<T> | ApiError> {
  try {
    return (await res.json()) as ApiSuccess<T> | ApiError;
  } catch {
    return {
      success: false,
      error: {
        code: "BAD_RESPONSE",
        message: `API returned an invalid response (${res.status})`,
      },
    };
  }
}

/** Build fetch headers without `Authorization` / `HeadersInit` union issues. */
export function authHeaders(
  token?: string | null,
  extra?: HeadersInit
): Headers {
  const headers = new Headers(extra);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

function shouldSkipRefresh(path: string): boolean {
  return (
    path.startsWith("/auth/login") ||
    path.startsWith("/auth/refresh") ||
    path.startsWith("/auth/set-password") ||
    path.startsWith("/auth/invite/")
  );
}

let refreshInFlight: Promise<string | null> | null = null;

/** Exchange refresh token for a new access JWT. Returns new access token or null. */
export async function refreshAccessSession(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;

    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      const body = await parseJson<AuthBundle>(res);
      if (!body.success) {
        clearSession();
        return null;
      }
      saveSession(body.data.token, body.data.user, {
        refreshToken: body.data.refreshToken,
        session: body.data.session,
      });
      return body.data.token;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export function isSessionEndedError(result: ApiError): boolean {
  return SESSION_ENDED_CODES.has(result.error.code);
}

function isAuthFailure(result: ApiError): boolean {
  return isSessionEndedError(result);
}

/** Refresh failed or impossible — sign out once and stop toast spam. */
function endSessionAndRedirect(): ApiError {
  forceSignOutToLogin();
  return SESSION_ENDED;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null; skipRefresh?: boolean } = {}
): Promise<ApiSuccess<T> | ApiError> {
  const { token, headers, skipRefresh, ...rest } = options;
  const merged = authHeaders(token, headers);
  if (!merged.has("Content-Type")) {
    merged.set("Content-Type", "application/json");
  }

  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: merged,
    });
    const result = await parseJson<T>(res);

    if (
      !result.success &&
      isAuthFailure(result) &&
      !skipRefresh &&
      !shouldSkipRefresh(path) &&
      (token || getToken())
    ) {
      const next = await refreshAccessSession();
      if (next) {
        const retryHeaders = authHeaders(next, headers);
        if (!retryHeaders.has("Content-Type")) {
          retryHeaders.set("Content-Type", "application/json");
        }
        const retryRes = await fetch(`${API_URL}${path}`, {
          ...rest,
          headers: retryHeaders,
        });
        const retryResult = await parseJson<T>(retryRes);
        if (!retryResult.success && isAuthFailure(retryResult)) {
          return endSessionAndRedirect();
        }
        return retryResult;
      }
      return endSessionAndRedirect();
    }

    return result;
  } catch {
    return NETWORK_ERROR;
  }
}

/** Multipart upload — do not set Content-Type (browser sets boundary). */
export async function apiUpload<T>(
  path: string,
  formData: FormData,
  token: string | null
): Promise<ApiSuccess<T> | ApiError> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: authHeaders(token),
      body: formData,
    });
    let result = await parseJson<T>(res);

    if (!result.success && isAuthFailure(result) && token) {
      const next = await refreshAccessSession();
      if (next) {
        const retry = await fetch(`${API_URL}${path}`, {
          method: "POST",
          headers: authHeaders(next),
          body: formData,
        });
        result = await parseJson<T>(retry);
        if (!result.success && isAuthFailure(result)) {
          return endSessionAndRedirect();
        }
      } else {
        return endSessionAndRedirect();
      }
    }

    return result;
  } catch {
    return NETWORK_ERROR;
  }
}

export async function apiDownload(path: string, token: string | null) {
  const run = async (bearer: string | null) =>
    fetch(`${API_URL}${path}`, {
      headers: authHeaders(bearer),
    });

  let res = await run(token);
  if (res.status === 401 && token) {
    const next = await refreshAccessSession();
    if (next) {
      res = await run(next);
    } else {
      forceSignOutToLogin();
      throw new Error(SESSION_ENDED.error.message);
    }
  }

  if (!res.ok) {
    if (res.status === 401) {
      forceSignOutToLogin();
      throw new Error(SESSION_ENDED.error.message);
    }
    let message = "Download failed";
    try {
      const body = (await res.json()) as ApiError;
      message = body.error?.message || message;
    } catch {
      /* binary or empty */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition);
  const fileName = match ? decodeURIComponent(match[1].replace(/"/g, "")) : "download";
  return { blob, fileName };
}

export { API_URL };
