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

async function parseJson<T>(res: Response): Promise<ApiSuccess<T> | ApiError> {
  const body = (await res.json()) as ApiSuccess<T> | ApiError;
  return body;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<ApiSuccess<T> | ApiError> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  return parseJson<T>(res);
}

/** Multipart upload — do not set Content-Type (browser sets boundary). */
export async function apiUpload<T>(
  path: string,
  formData: FormData,
  token: string | null
): Promise<ApiSuccess<T> | ApiError> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });
  return parseJson<T>(res);
}

export async function apiDownload(path: string, token: string | null) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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
