import { prisma } from "./prisma";

/**
 * Portal file uploads (Documents, Firm Library, staging, cases).
 * E-sign ceremony still requires PDF — enforced in signature services + UI.
 */
export const PRODUCT_UPLOAD_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
] as const;

export const PRODUCT_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
] as const;

const PRODUCT_EXT_SET = new Set<string>(PRODUCT_UPLOAD_EXTENSIONS);
const PRODUCT_MIME_SET = new Set<string>(PRODUCT_UPLOAD_MIME_TYPES);

export const DEFAULT_UPLOAD_SETTINGS = {
  allowedExtensions: [...PRODUCT_UPLOAD_EXTENSIONS],
  allowedMimeTypes: [...PRODUCT_UPLOAD_MIME_TYPES],
  maxUploadBytes: 25 * 1024 * 1024,
};

function sameStringList(a: string[], b: readonly string[]) {
  if (a.length !== b.length) return false;
  const normalized = a.map((x) => x.toLowerCase()).sort();
  const expected = [...b].map((x) => x.toLowerCase()).sort();
  return normalized.every((v, i) => v === expected[i]);
}

/** True when extension or MIME matches the product allowlist. */
export function isProductUploadAllowed(file: {
  originalName: string;
  mimeType?: string | null;
}) {
  const ext = extensionOf(file.originalName);
  const mime = (file.mimeType || "").toLowerCase().trim();
  const extOk = Boolean(ext && PRODUCT_EXT_SET.has(ext));
  const mimeOk = Boolean(mime && PRODUCT_MIME_SET.has(mime));
  return extOk || mimeOk;
}

export async function getUploadSettings() {
  const existing = await prisma.uploadSettings.findUnique({ where: { id: "default" } });
  if (!existing) {
    return prisma.uploadSettings.create({
      data: {
        id: "default",
        ...DEFAULT_UPLOAD_SETTINGS,
      },
    });
  }

  const needsSync =
    !sameStringList(existing.allowedExtensions, PRODUCT_UPLOAD_EXTENSIONS) ||
    !sameStringList(existing.allowedMimeTypes, PRODUCT_UPLOAD_MIME_TYPES);

  if (!needsSync) return existing;

  return prisma.uploadSettings.update({
    where: { id: "default" },
    data: {
      allowedExtensions: [...PRODUCT_UPLOAD_EXTENSIONS],
      allowedMimeTypes: [...PRODUCT_UPLOAD_MIME_TYPES],
    },
  });
}

export function extensionOf(fileName: string) {
  const parts = fileName.toLowerCase().split(".");
  if (parts.length < 2) return "";
  return parts[parts.length - 1] || "";
}
