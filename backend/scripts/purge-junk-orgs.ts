/**
 * Purge test client organisations (and their data). Keep HK enterprises + all admins + system settings.
 *
 *   npx tsx scripts/purge-junk-orgs.ts           # dry-run
 *   npx tsx scripts/purge-junk-orgs.ts --execute
 */
import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { UserRole } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { storageRoot } from "../src/lib/storage";

const KEEP_NAME = "hk enterprises";
const EXECUTE = process.argv.includes("--execute");

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

const main = async (): Promise<void> => {
  const admins = await prisma.user.findMany({
    where: { role: UserRole.admin },
    select: { id: true, email: true, name: true },
  });

  const orgs = await prisma.organisation.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          users: true,
          cases: true,
          documents: true,
          employees: true,
          onboardingRuns: true,
          signatureRequests: true,
          folders: true,
        },
      },
      users: {
        where: { role: UserRole.client },
        select: { id: true, email: true },
      },
    },
  });

  const keep = orgs.filter((o) => norm(o.name) === KEEP_NAME);
  const del = orgs.filter((o) => norm(o.name) !== KEEP_NAME);

  console.log(
    JSON.stringify(
      {
        mode: EXECUTE ? "EXECUTE" : "DRY_RUN",
        adminsKept: admins.map((a) => a.email),
        keepOrgs: keep.map((o) => ({
          id: o.id,
          name: o.name,
          clients: o.users.map((u) => u.email),
          counts: o._count,
        })),
        deleteOrgs: del.map((o) => ({
          id: o.id,
          name: o.name,
          clients: o.users.map((u) => u.email),
          counts: o._count,
        })),
      },
      null,
      2
    )
  );

  if (keep.length !== 1) {
    throw new Error(
      `Expected exactly 1 keep org matching "${KEEP_NAME}", found ${keep.length}`
    );
  }

  if (!EXECUTE) {
    console.log("\nDry-run only. Re-run with --execute to purge.");
    await prisma.$disconnect();
    return;
  }

  const root = storageRoot();

  for (const org of del) {
    const clientIds = org.users.map((u) => u.id);

    await prisma.$transaction(
      async (tx) => {
        if (clientIds.length > 0) {
          await tx.user.deleteMany({ where: { id: { in: clientIds } } });
        }
        await tx.organisation.delete({ where: { id: org.id } });
      },
      { maxWait: 60_000, timeout: 180_000 }
    );

    const orgDir = path.join(root, org.id);
    try {
      await fs.rm(orgDir, { recursive: true, force: true });
    } catch {
      // best-effort disk cleanup
    }

    console.log(`Purged: ${org.name} (${org.id})`);
  }

  const remaining = await prisma.organisation.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const adminCount = await prisma.user.count({ where: { role: UserRole.admin } });
  const orphanClients = await prisma.user.count({
    where: { role: UserRole.client, organisationId: null },
  });
  const smtp = await prisma.smtpSettings.findUnique({ where: { id: "default" } });
  const templates = await prisma.emailTemplate.count();
  const categories = await prisma.caseCategory.count();
  const library = await prisma.firmLibraryDocument.count();

  console.log(
    JSON.stringify(
      {
        remainingOrgs: remaining,
        adminCount,
        orphanClients,
        smtpPresent: !!smtp,
        emailTemplateCount: templates,
        caseCategoryCount: categories,
        firmLibraryDocCount: library,
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
};

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
