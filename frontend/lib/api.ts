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

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<ApiSuccess<T> | ApiError> {
  const { token, headers, ...rest } = options;
  const merged = authHeaders(token, headers);
  if (!merged.has("Content-Type")) {
    merged.set("Content-Type", "application/json");
  }
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: merged,
    });
    return parseJson<T>(res);
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
    return parseJson<T>(res);
  } catch {
    return NETWORK_ERROR;
  }
}

export async function apiDownload(path: string, token: string | null) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
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
