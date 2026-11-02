/**
 * Portal-wide blob download helper.
 * Delays revoke so the browser can start the download (immediate revoke can no-op).
 */
export const triggerBlobDownload = (blob: Blob, fileName: string): void => {
  const name = (fileName || "download").trim() || "download";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2500);
};

/** Trigger download from an existing object URL without revoking it. */
export const triggerUrlDownload = (href: string, fileName: string): void => {
  const name = (fileName || "download").trim() || "download";
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
};

/**
 * Fetch an authenticated file URL and download it.
 */
export const fetchAuthenticatedDownload = async (
  url: string,
  fileName: string,
  token: string | null
): Promise<void> => {
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error("Download failed");
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition);
  const fromHeader = match
    ? decodeURIComponent(match[1].replace(/"/g, "").trim())
    : "";
  triggerBlobDownload(blob, fromHeader || fileName);
};
