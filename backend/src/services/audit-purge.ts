import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { recordAudit } from "./audit";

/** Delete audit rows older than AUDIT_RETENTION_DAYS. Archive purge must never call this. */
export async function purgeExpiredAuditEvents(): Promise<{ deleted: number }> {
  const cutoff = new Date(
    Date.now() - env.AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );

  const doomed = await prisma.auditEvent.count({
    where: { createdAt: { lt: cutoff } },
  });

  if (doomed <= 0) {
    return { deleted: 0 };
  }

  await recordAudit({
    action: "ops.audit_retention_purge",
    entityType: "audit",
    actorRole: "system",
    summary: `Retention purge: removing ${doomed} audit event(s) older than ${env.AUDIT_RETENTION_DAYS} days`,
    meta: { deleted: doomed, cutoff: cutoff.toISOString() },
  });

  // Marker row is created now — outside cutoff — so it is kept.
  const result = await prisma.auditEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  return { deleted: result.count };
}
