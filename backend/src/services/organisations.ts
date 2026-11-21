import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { removeStoredFile } from "../lib/storage";

function httpError(message: string, status: number, code: string) {
  return Object.assign(new Error(message), { status, code });
}

const collectUniquePaths = (paths: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    const trimmed = typeof p === "string" ? p.trim() : "";
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
};

/** Gather disk paths owned by an organisation before cascading DB delete. */
export async function collectOrganisationStoragePaths(
  organisationId: string
): Promise<string[]> {
  const [versions, attachments, signatureRequests, clientUsers] = await Promise.all([
    prisma.documentVersion.findMany({
      where: { document: { organisationId } },
      select: { storagePath: true },
    }),
    prisma.caseAttachment.findMany({
      where: { case: { organisationId } },
      select: { storagePath: true },
    }),
    prisma.signatureRequest.findMany({
      where: { organisationId },
      select: {
        sourceStoragePath: true,
        signedStoragePath: true,
        signatureImagePath: true,
        auditStoragePath: true,
        fields: { select: { signedImagePath: true } },
      },
    }),
    prisma.user.findMany({
      where: { organisationId, role: UserRole.client },
      select: {
        signaturePngPath: true,
        signatures: { select: { storagePath: true } },
      },
    }),
  ]);

  const paths: Array<string | null | undefined> = [
    ...versions.map((v) => v.storagePath),
    ...attachments.map((a) => a.storagePath),
  ];

  for (const req of signatureRequests) {
    paths.push(
      req.sourceStoragePath,
      req.signedStoragePath,
      req.signatureImagePath,
      req.auditStoragePath
    );
    for (const field of req.fields) {
      paths.push(field.signedImagePath);
    }
  }

  for (const user of clientUsers) {
    paths.push(user.signaturePngPath);
    for (const sig of user.signatures) {
      paths.push(sig.storagePath);
    }
  }

  return collectUniquePaths(paths);
}

export type HardDeleteOrganisationResult = {
  id: string;
  name: string;
  removedFiles: number;
};

/**
 * Permanently delete an organisation and its client users.
 * Requires exact confirmName match and inactive status (unless requireInactive=false for tests).
 * Collects storage paths → deletes users + org in a transaction → unlinks files best-effort.
 */
export async function hardDeleteOrganisation(input: {
  organisationId: string;
  confirmName: string;
  requireInactive?: boolean;
}): Promise<HardDeleteOrganisationResult> {
  const requireInactive = input.requireInactive !== false;
  const confirmName = input.confirmName.trim();
  if (!confirmName) {
    throw httpError("Type the organisation name to confirm deletion", 400, "CONFIRM_REQUIRED");
  }

  const org = await prisma.organisation.findUnique({
    where: { id: input.organisationId },
    select: { id: true, name: true, status: true },
  });
  if (!org) {
    throw httpError("Organisation not found", 404, "NOT_FOUND");
  }
  if (org.name.trim() !== confirmName) {
    throw httpError(
      "Confirmation name does not match the organisation",
      400,
      "CONFIRM_MISMATCH"
    );
  }
  if (requireInactive && org.status !== "inactive") {
    throw httpError(
      "Deactivate the organisation before permanently deleting it",
      409,
      "MUST_BE_INACTIVE"
    );
  }

  const storagePaths = await collectOrganisationStoragePaths(org.id);

  await prisma.$transaction(async (tx) => {
    await tx.user.deleteMany({
      where: { organisationId: org.id, role: UserRole.client },
    });
    await tx.organisation.delete({ where: { id: org.id } });
  });

  let removedFiles = 0;
  for (const relativePath of storagePaths) {
    try {
      await removeStoredFile(relativePath);
      removedFiles += 1;
    } catch {
      // Best-effort disk cleanup after successful DB delete
    }
  }

  return { id: org.id, name: org.name, removedFiles };
}

export async function bulkSetOrganisationStatus(input: {
  ids: string[];
  status: "active" | "inactive";
}): Promise<{ updated: number; skipped: number }> {
  const ids = [...new Set(input.ids.map(String).filter(Boolean))];
  if (ids.length === 0) {
    throw httpError("Select at least one organisation", 400, "VALIDATION_ERROR");
  }

  const result = await prisma.organisation.updateMany({
    where: {
      id: { in: ids },
      status: { not: input.status },
    },
    data: { status: input.status },
  });

  return {
    updated: result.count,
    skipped: Math.max(0, ids.length - result.count),
  };
}

export const BULK_DELETE_PHRASE = "DELETE";

/**
 * Hard-delete multiple inactive organisations.
 * confirmPhrase must be exactly "DELETE". Each org is deleted independently;
 * partial success returns counts + errors.
 */
export async function bulkHardDeleteOrganisations(input: {
  ids: string[];
  confirmPhrase: string;
}): Promise<{
  deleted: HardDeleteOrganisationResult[];
  failed: Array<{ id: string; message: string; code: string }>;
}> {
  if (input.confirmPhrase.trim() !== BULK_DELETE_PHRASE) {
    throw httpError(
      `Type ${BULK_DELETE_PHRASE} to confirm permanent deletion`,
      400,
      "CONFIRM_MISMATCH"
    );
  }

  const ids = [...new Set(input.ids.map(String).filter(Boolean))];
  if (ids.length === 0) {
    throw httpError("Select at least one organisation", 400, "VALIDATION_ERROR");
  }

  const orgs = await prisma.organisation.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, status: true },
  });
  const byId = new Map(orgs.map((o) => [o.id, o]));

  const deleted: HardDeleteOrganisationResult[] = [];
  const failed: Array<{ id: string; message: string; code: string }> = [];

  for (const id of ids) {
    const org = byId.get(id);
    if (!org) {
      failed.push({ id, message: "Organisation not found", code: "NOT_FOUND" });
      continue;
    }
    if (org.status !== "inactive") {
      failed.push({
        id,
        message: `${org.name} must be inactive before permanent delete`,
        code: "MUST_BE_INACTIVE",
      });
      continue;
    }
    try {
      const result = await hardDeleteOrganisation({
        organisationId: org.id,
        confirmName: org.name,
        requireInactive: true,
      });
      deleted.push(result);
    } catch (err) {
      const e = err as { message?: string; code?: string };
      failed.push({
        id,
        message: e.message || "Unable to delete organisation",
        code: e.code || "SERVER_ERROR",
      });
    }
  }

  return { deleted, failed };
}
