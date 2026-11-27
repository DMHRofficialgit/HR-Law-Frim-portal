import { prisma } from "../lib/prisma";
import { purgeEligibleWhere } from "../lib/archive";
import { deleteCase } from "./cases";
import { deleteEmployee } from "./employees";
import { hardDeleteOrganisation } from "./organisations";
import { recordAudit } from "./audit";

export type PurgeArchivesResult = {
  organisations: { purged: number; failed: number };
  employees: { purged: number; skipped: number; failed: number };
  cases: { purged: number; failed: number };
};

/**
 * Hard-delete records archived longer than ARCHIVE_RETENTION_DAYS.
 * Safe to run daily. Employees with linked cases are skipped.
 */
export async function purgeExpiredArchives(): Promise<PurgeArchivesResult> {
  const where = purgeEligibleWhere();

  const result: PurgeArchivesResult = {
    organisations: { purged: 0, failed: 0 },
    employees: { purged: 0, skipped: 0, failed: 0 },
    cases: { purged: 0, failed: 0 },
  };

  const orgs = await prisma.organisation.findMany({
    where,
    select: { id: true, name: true },
  });
  for (const org of orgs) {
    try {
      await hardDeleteOrganisation({
        organisationId: org.id,
        confirmName: org.name,
        requireArchivedOrInactive: false,
      });
      result.organisations.purged += 1;
    } catch {
      result.organisations.failed += 1;
    }
  }

  const employees = await prisma.employee.findMany({
    where,
    select: { id: true, organisationId: true },
  });
  for (const emp of employees) {
    try {
      const del = await deleteEmployee(emp.organisationId, emp.id);
      if (del.ok) result.employees.purged += 1;
      else if (del.reason === "has_cases") result.employees.skipped += 1;
      else result.employees.failed += 1;
    } catch {
      result.employees.failed += 1;
    }
  }

  const cases = await prisma.case.findMany({
    where,
    select: { id: true },
  });
  for (const c of cases) {
    try {
      const del = await deleteCase(c.id);
      if (del) result.cases.purged += 1;
      else result.cases.failed += 1;
    } catch {
      result.cases.failed += 1;
    }
  }

  void recordAudit({
    action: "ops.archive_purge",
    entityType: "archive_purge",
    summary: "Completed archive purge",
    meta: result,
  });

  return result;
}
