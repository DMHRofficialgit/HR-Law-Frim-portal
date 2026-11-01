import path from "path";
import { prisma } from "../lib/prisma";
import { absoluteStoragePath, removeStoredFile, writeStoredFile } from "../lib/storage";

export const MAX_PROFILE_SIGNATURES = 5;

function httpError(message: string, status: number, code: string) {
  return Object.assign(new Error(message), { status, code });
}

export type SignatureMeta = {
  id: string;
  isDefault: boolean;
  createdAt: Date;
};

async function syncLegacyDefaultPath(userId: string) {
  const def = await prisma.userSignature.findFirst({
    where: { userId, isDefault: true },
  });
  const fallback =
    def ||
    (await prisma.userSignature.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }));
  await prisma.user.update({
    where: { id: userId },
    data: { signaturePngPath: fallback?.storagePath || null },
  });
  if (fallback && !fallback.isDefault) {
    await prisma.userSignature.update({
      where: { id: fallback.id },
      data: { isDefault: true },
    });
  }
}

export async function listProfileSignatures(userId: string) {
  const rows = await prisma.userSignature.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  return {
    signatures: rows.map(
      (r): SignatureMeta => ({
        id: r.id,
        isDefault: r.isDefault,
        createdAt: r.createdAt,
      })
    ),
    max: MAX_PROFILE_SIGNATURES,
    hasSignature: rows.length > 0,
  };
}

export async function getProfileSignaturePath(userId: string, signatureId?: string | null) {
  if (signatureId) {
    const row = await prisma.userSignature.findFirst({
      where: { id: signatureId, userId },
    });
    return row?.storagePath || null;
  }
  const def = await prisma.userSignature.findFirst({
    where: { userId, isDefault: true },
  });
  if (def) return def.storagePath;
  const any = await prisma.userSignature.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  if (any) return any.storagePath;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user?.signaturePngPath || null;
}

export async function addProfileSignature(params: {
  userId: string;
  buffer: Buffer;
  originalName?: string;
  mimeType?: string;
}) {
  const isPng =
    params.mimeType === "image/png" ||
    (params.originalName || "").toLowerCase().endsWith(".png");
  if (!isPng) {
    throw httpError("Signature must be a PNG", 400, "VALIDATION_ERROR");
  }

  const count = await prisma.userSignature.count({ where: { userId: params.userId } });
  if (count >= MAX_PROFILE_SIGNATURES) {
    throw httpError(
      `You can save up to ${MAX_PROFILE_SIGNATURES} signatures. Remove one first.`,
      400,
      "VALIDATION_ERROR"
    );
  }

  const relative = await writeStoredFile(
    path.join("profiles", params.userId),
    `signature_${Date.now()}.png`,
    params.buffer
  );

  const makeDefault = count === 0;
  const row = await prisma.userSignature.create({
    data: {
      userId: params.userId,
      storagePath: relative,
      isDefault: makeDefault,
    },
  });

  if (makeDefault) {
    await prisma.user.update({
      where: { id: params.userId },
      data: { signaturePngPath: relative },
    });
  }

  return listProfileSignatures(params.userId);
}

export async function setDefaultProfileSignature(userId: string, signatureId: string) {
  const row = await prisma.userSignature.findFirst({
    where: { id: signatureId, userId },
  });
  if (!row) throw httpError("Signature not found", 404, "NOT_FOUND");

  await prisma.$transaction([
    prisma.userSignature.updateMany({
      where: { userId },
      data: { isDefault: false },
    }),
    prisma.userSignature.update({
      where: { id: row.id },
      data: { isDefault: true },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { signaturePngPath: row.storagePath },
    }),
  ]);

  return listProfileSignatures(userId);
}

export async function deleteProfileSignature(userId: string, signatureId: string) {
  const row = await prisma.userSignature.findFirst({
    where: { id: signatureId, userId },
  });
  if (!row) throw httpError("Signature not found", 404, "NOT_FOUND");

  await prisma.userSignature.delete({ where: { id: row.id } });
  try {
    await removeStoredFile(row.storagePath);
  } catch {
    /* ignore missing file */
  }
  await syncLegacyDefaultPath(userId);
  return listProfileSignatures(userId);
}

export async function clearAllProfileSignatures(userId: string) {
  const rows = await prisma.userSignature.findMany({ where: { userId } });
  await prisma.userSignature.deleteMany({ where: { userId } });
  for (const row of rows) {
    try {
      await removeStoredFile(row.storagePath);
    } catch {
      /* ignore */
    }
  }
  await prisma.user.update({
    where: { id: userId },
    data: { signaturePngPath: null },
  });
  return listProfileSignatures(userId);
}

export function absoluteSignaturePath(relative: string) {
  return absoluteStoragePath(relative);
}
