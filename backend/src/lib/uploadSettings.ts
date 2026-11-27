import { prisma } from "./prisma";

/**
 * Portal file uploads (Documents, Firm Library / staging, cases).
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

export function extensionOf(fileName: string) {
  const parts = fileName.toLowerCase().split(".");
  if (parts.length < 2) return "";
  return parts[parts.length - 1] || "";
}

/** Sniff common magic bytes; null = unknown / skip strict magic. */
export function sniffUploadKind(buffer: Buffer): "pdf" | "png" | "jpeg" | "gif" | "webp" | "docx" | "doc" | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "pdf";
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer.length >= 6) {
    const head = buffer.subarray(0, 6).toString("ascii");
    if (head === "GIF87a" || head === "GIF89a") return "gif";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  // DOCX / OOXML is a ZIP
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) return "docx";
  // Legacy OLE Compound Document (old .doc)
  if (
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  ) {
    return "doc";
  }
  return null;
}

function magicMatchesExt(ext: string, kind: ReturnType<typeof sniffUploadKind>): boolean {
  if (!kind) return true;
  if (ext === "jpg" || ext === "jpeg") return kind === "jpeg";
  if (ext === "pdf") return kind === "pdf";
  if (ext === "png") return kind === "png";
  if (ext === "gif") return kind === "gif";
  if (ext === "webp") return kind === "webp";
  if (ext === "docx") return kind === "docx";
  if (ext === "doc") return kind === "doc" || kind === "docx";
  return true;
}

/**
 * True when extension AND MIME match the product allowlist.
 * When `buffer` is provided, magic bytes must also agree with the extension.
 */
export function isProductUploadAllowed(file: {
  originalName: string;
  mimeType?: string | null;
  buffer?: Buffer | null;
}) {
  const ext = extensionOf(file.originalName);
  const mime = (file.mimeType || "").toLowerCase().trim();
  const extOk = Boolean(ext && PRODUCT_EXT_SET.has(ext));
  const mimeOk = Boolean(mime && PRODUCT_MIME_SET.has(mime));
  if (!extOk || !mimeOk) return false;
  if (file.buffer && file.buffer.length > 0) {
    const kind = sniffUploadKind(file.buffer);
    if (kind && !magicMatchesExt(ext, kind)) return false;
  }
  return true;
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
