/** Transact Pro–style soft archive retention before hard purge. */
export const ARCHIVE_RETENTION_DAYS = 30;

export function archiveCutoffDate(now = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - ARCHIVE_RETENTION_DAYS);
  return d;
}

/** Prisma filter: active list vs archived list. */
export function archivedWhere(showArchived: boolean) {
  return showArchived
    ? { archivedAt: { not: null } }
    : { archivedAt: null };
}

export function purgeEligibleWhere(now = new Date()) {
  return {
    archivedAt: { not: null, lte: archiveCutoffDate(now) },
  };
}
