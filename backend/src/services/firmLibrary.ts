import path from "path";
import {
  FirmLibraryFieldRole,
  SignatureFieldType,
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import { absoluteStoragePath, removeStoredFile, writeStoredFile } from "../lib/storage";
import { validateUpload, type UploadedFileInput } from "./documents";

function httpError(message: string, status: number, code: string) {
  return Object.assign(new Error(message), { status, code });
}

function sanitizeBaseName(fileName: string) {
  const base = path.basename(fileName).replace(/[^\w.\- ()[\]]+/g, "_").trim();
  return base || "document";
}

function parseFieldType(raw: string): SignatureFieldType {
  const v = String(raw || "").toLowerCase();
  if ((Object.values(SignatureFieldType) as string[]).includes(v)) {
    return v as SignatureFieldType;
  }
  throw httpError(`Invalid field type: ${raw}`, 400, "VALIDATION_ERROR");
}

function parseRole(raw: string): FirmLibraryFieldRole {
  const v = String(raw || "").toLowerCase();
  if (v === "admin") return FirmLibraryFieldRole.admin;
  if (v === "client") return FirmLibraryFieldRole.client;
  throw httpError("Field role must be client or admin", 400, "VALIDATION_ERROR");
}

function defaultLabelForType(type: SignatureFieldType) {
  if (type === SignatureFieldType.initials) return "Initials";
  if (type === SignatureFieldType.text) return "Text";
  if (type === SignatureFieldType.date) return "Date";
  if (type === SignatureFieldType.name) return "Name";
  return "Signature";
}

const INK_TYPES: SignatureFieldType[] = [
  SignatureFieldType.signature,
  SignatureFieldType.initials,
];

function parsePngDataUrl(dataUrl: string): Buffer {
  const trimmed = dataUrl.trim();
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/i.exec(trimmed);
  if (!m) {
    throw httpError("Admin ink must be a PNG data URL", 400, "VALIDATION_ERROR");
  }
  const buf = Buffer.from(m[1].replace(/\s/g, ""), "base64");
  if (buf.length < 32 || buf.length > 2 * 1024 * 1024) {
    throw httpError("Admin ink image is invalid or too large", 400, "VALIDATION_ERROR");
  }
  return buf;
}

export function firmLibraryFieldHasAdminInk(f: {
  role: FirmLibraryFieldRole;
  type: SignatureFieldType;
  signedImagePath: string | null;
  valueText: string | null;
}): boolean {
  if (f.role !== FirmLibraryFieldRole.admin) return true;
  if (INK_TYPES.includes(f.type)) return Boolean(f.signedImagePath);
  return Boolean((f.valueText && f.valueText.trim()) || f.signedImagePath);
}

const fieldOrder = { orderBy: { sortOrder: "asc" as const } };

export async function listFirmLibrary() {
  const rows = await prisma.firmLibraryDocument.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    include: {
      fields: true,
      _count: { select: { fields: true } },
    },
  });
  return rows.map(({ _count, fields, ...doc }) => {
    const adminOk = fields.every((f) => firmLibraryFieldHasAdminInk(f));
    return {
      ...doc,
      fieldCount: _count.fields,
      adminInkReady: !doc.requiresSignature || (_count.fields > 0 && adminOk),
    };
  });
}

export async function getFirmLibraryDocument(id: string) {
  const doc = await prisma.firmLibraryDocument.findUnique({
    where: { id },
    include: { fields: fieldOrder },
  });
  if (!doc) throw httpError("Library document not found", 404, "NOT_FOUND");
  return {
    ...doc,
    adminInkReady:
      !doc.requiresSignature ||
      (doc.fields.length > 0 && doc.fields.every((f) => firmLibraryFieldHasAdminInk(f))),
  };
}

export async function uploadFirmLibraryDocument(params: {
  title?: string;
  requiresSignature?: boolean;
  file: UploadedFileInput;
}) {
  const validation = await validateUpload(params.file);
  if (!validation.ok) {
    throw httpError(validation.message, 400, "UPLOAD_REJECTED");
  }

  const safeName = sanitizeBaseName(params.file.originalName);
  const title = (params.title || safeName.replace(/\.[^.]+$/, "") || safeName).trim();
  const count = await prisma.firmLibraryDocument.count();
  const storedName = `${Date.now()}_${safeName}`;
  const storagePath = await writeStoredFile(
    path.join("firm-library"),
    storedName,
    params.file.buffer
  );

  const created = await prisma.firmLibraryDocument.create({
    data: {
      title,
      fileName: safeName,
      mimeType: params.file.mimeType || "application/octet-stream",
      sizeBytes: params.file.size,
      storagePath,
      requiresSignature: params.requiresSignature !== false,
      sortOrder: count,
    },
  });
  return getFirmLibraryDocument(created.id);
}

export async function updateFirmLibraryDocument(params: {
  id: string;
  title?: string;
  requiresSignature?: boolean;
  sortOrder?: number;
}) {
  const existing = await prisma.firmLibraryDocument.findUnique({ where: { id: params.id } });
  if (!existing) throw httpError("Library document not found", 404, "NOT_FOUND");

  await prisma.firmLibraryDocument.update({
    where: { id: params.id },
    data: {
      ...(params.title !== undefined ? { title: params.title.trim() || existing.title } : {}),
      ...(params.requiresSignature !== undefined
        ? { requiresSignature: params.requiresSignature }
        : {}),
      ...(params.sortOrder !== undefined ? { sortOrder: params.sortOrder } : {}),
    },
  });
  return getFirmLibraryDocument(params.id);
}

export type TemplateFieldInput = {
  type: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  required?: boolean;
  sortOrder?: number;
  role: string;
  /** PNG data URL for Admin ink fields */
  inkDataUrl?: string | null;
  valueText?: string | null;
  /** Reuse existing ink file when re-saving without re-drawing */
  keepSignedImagePath?: string | null;
};

export async function replaceFirmLibraryFields(params: {
  id: string;
  fields: TemplateFieldInput[];
}) {
  const existing = await prisma.firmLibraryDocument.findUnique({
    where: { id: params.id },
    include: { fields: true },
  });
  if (!existing) throw httpError("Library document not found", 404, "NOT_FOUND");
  if (!existing.requiresSignature && params.fields.length > 0) {
    throw httpError(
      "Turn on “Requires signature” before saving signature boxes",
      400,
      "VALIDATION_ERROR"
    );
  }

  for (const f of params.fields) {
    if (f.page < 1 || f.width <= 0 || f.height <= 0) {
      throw httpError("Invalid field geometry", 400, "VALIDATION_ERROR");
    }
    if (f.x < 0 || f.y < 0 || f.x + f.width > 1.01 || f.y + f.height > 1.01) {
      throw httpError("Field coordinates must be normalized 0–1 within the page", 400, "VALIDATION_ERROR");
    }
    parseFieldType(f.type);
    parseRole(f.role);
  }

  const oldInkPaths = existing.fields
    .map((f) => f.signedImagePath)
    .filter((p): p is string => Boolean(p));

  const createdIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    await tx.firmLibraryField.deleteMany({ where: { libraryDocumentId: existing.id } });
  });

  for (let i = 0; i < params.fields.length; i++) {
    const f = params.fields[i];
    const type = parseFieldType(f.type);
    const role = parseRole(f.role);
    let signedImagePath: string | null = null;
    let valueText: string | null = null;

    if (role === FirmLibraryFieldRole.client) {
      signedImagePath = null;
      valueText = null;
    } else {
      valueText = f.valueText?.trim() || null;
      if (f.inkDataUrl) {
        const buf = parsePngDataUrl(f.inkDataUrl);
        signedImagePath = await writeStoredFile(
          path.join("firm-library", existing.id, "fields"),
          `${Date.now()}_${i}.png`,
          buf
        );
      } else if (
        f.keepSignedImagePath &&
        oldInkPaths.includes(f.keepSignedImagePath)
      ) {
        signedImagePath = f.keepSignedImagePath;
      }

      if (INK_TYPES.includes(type) && !signedImagePath) {
        throw httpError(
          `Admin field “${f.label || defaultLabelForType(type)}” needs a signature saved on the template`,
          400,
          "ADMIN_INK_REQUIRED"
        );
      }
      if (
        !INK_TYPES.includes(type) &&
        !valueText &&
        !signedImagePath &&
        f.required !== false
      ) {
        throw httpError(
          `Admin field “${f.label || defaultLabelForType(type)}” needs a value saved on the template`,
          400,
          "ADMIN_INK_REQUIRED"
        );
      }
    }

    const row = await prisma.firmLibraryField.create({
      data: {
        libraryDocumentId: existing.id,
        type,
        page: f.page,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        label: f.label?.trim() || defaultLabelForType(type),
        required: f.required !== false,
        sortOrder: f.sortOrder ?? i,
        role,
        signedImagePath,
        valueText,
      },
    });
    createdIds.push(row.id);
  }

  const kept = new Set(
    (
      await prisma.firmLibraryField.findMany({
        where: { libraryDocumentId: existing.id },
        select: { signedImagePath: true },
      })
    )
      .map((f) => f.signedImagePath)
      .filter(Boolean)
  );
  for (const p of oldInkPaths) {
    if (!kept.has(p)) {
      await removeStoredFile(p).catch(() => undefined);
    }
  }

  void createdIds;
  return getFirmLibraryDocument(existing.id);
}

export async function deleteFirmLibraryDocument(id: string) {
  const existing = await prisma.firmLibraryDocument.findUnique({
    where: { id },
    include: { fields: true },
  });
  if (!existing) throw httpError("Library document not found", 404, "NOT_FOUND");
  for (const f of existing.fields) {
    if (f.signedImagePath) await removeStoredFile(f.signedImagePath).catch(() => undefined);
  }
  await removeStoredFile(existing.storagePath);
  await prisma.firmLibraryDocument.delete({ where: { id } });
  return existing;
}

export async function getFirmLibraryFileAbsolute(id: string) {
  const row = await prisma.firmLibraryDocument.findUnique({ where: { id } });
  if (!row) throw httpError("Library document not found", 404, "NOT_FOUND");
  return { row, absolutePath: absoluteStoragePath(row.storagePath) };
}

export async function getFirmLibraryFieldInkAbsolute(documentId: string, fieldId: string) {
  const field = await prisma.firmLibraryField.findFirst({
    where: { id: fieldId, libraryDocumentId: documentId },
  });
  if (!field?.signedImagePath) {
    throw httpError("Template ink not found", 404, "NOT_FOUND");
  }
  return { field, absolutePath: absoluteStoragePath(field.signedImagePath) };
}
