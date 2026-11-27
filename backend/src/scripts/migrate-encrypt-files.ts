/**
 * Encrypt existing on-disk / Spaces files at rest (#2).
 *
 *   npx tsx src/scripts/migrate-encrypt-files.ts --dry-run
 *   npx tsx src/scripts/migrate-encrypt-files.ts --apply
 *   npx tsx src/scripts/migrate-encrypt-files.ts --apply --limit=50
 *
 * Requires FILE_SECRET_KEY. Backup storage before --apply.
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { isEncryptedFileBlob, wrapStoredFileBytes } from "../lib/file-crypto";
import { requireFileSecretKey } from "../config/env";
import { getStorageDriver } from "../lib/storage";

async function collectPaths(): Promise<string[]> {
  const paths = new Set<string>();

  const versions = await prisma.documentVersion.findMany({
    select: { storagePath: true },
  });
  for (const v of versions) if (v.storagePath) paths.add(v.storagePath);

  const attachments = await prisma.caseAttachment.findMany({
    select: { storagePath: true },
  });
  for (const a of attachments) if (a.storagePath) paths.add(a.storagePath);

  const library = await prisma.firmLibraryDocument.findMany({
    select: { storagePath: true },
  });
  for (const d of library) if (d.storagePath) paths.add(d.storagePath);

  const libFields = await prisma.firmLibraryField.findMany({
    select: { signedImagePath: true },
  });
  for (const f of libFields) if (f.signedImagePath) paths.add(f.signedImagePath);

  const staging = await prisma.firmStagingFile.findMany({
    select: { storagePath: true },
  });
  for (const s of staging) if (s.storagePath) paths.add(s.storagePath);

  const sigReqs = await prisma.signatureRequest.findMany({
    select: {
      sourceStoragePath: true,
      signedStoragePath: true,
      signatureImagePath: true,
      auditStoragePath: true,
    },
  });
  for (const r of sigReqs) {
    if (r.sourceStoragePath) paths.add(r.sourceStoragePath);
    if (r.signedStoragePath) paths.add(r.signedStoragePath);
    if (r.signatureImagePath) paths.add(r.signatureImagePath);
    if (r.auditStoragePath) paths.add(r.auditStoragePath);
  }

  const sigFields = await prisma.signatureField.findMany({
    select: { signedImagePath: true },
  });
  for (const f of sigFields) if (f.signedImagePath) paths.add(f.signedImagePath);

  const profiles = await prisma.userSignature.findMany({
    select: { storagePath: true },
  });
  for (const p of profiles) if (p.storagePath) paths.add(p.storagePath);

  const users = await prisma.user.findMany({
    select: { signaturePngPath: true },
  });
  for (const u of users) if (u.signaturePngPath) paths.add(u.signaturePngPath);

  return [...paths];
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run") || !args.includes("--apply");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

  const key = requireFileSecretKey();
  const driver = getStorageDriver();
  let paths = await collectPaths();
  if (limit > 0) paths = paths.slice(0, limit);

  let skipped = 0;
  let encrypted = 0;
  let missing = 0;
  let errors = 0;

  console.info(
    `[migrate-encrypt-files] mode=${dryRun ? "dry-run" : "apply"} files=${paths.length}`
  );

  for (const keyPath of paths) {
    try {
      if (!(await driver.exists(keyPath))) {
        missing += 1;
        console.warn("  missing", keyPath);
        continue;
      }
      const raw = await driver.getCiphertextBuffer(keyPath);
      if (isEncryptedFileBlob(raw)) {
        skipped += 1;
        continue;
      }
      if (dryRun) {
        encrypted += 1;
        console.info("  would encrypt", keyPath, `(${raw.length} bytes)`);
        continue;
      }
      const sealed = wrapStoredFileBytes(raw, key);
      // put() encrypts again — write ciphertext directly via put after temporary unwrap trick:
      // Driver put always encrypts plaintext. Pass plaintext (raw) so put seals once.
      await driver.put(keyPath, raw);
      encrypted += 1;
      console.info("  encrypted", keyPath, `(${sealed.length} bytes on disk)`);
    } catch (err) {
      errors += 1;
      console.error("  error", keyPath, err instanceof Error ? err.message : err);
    }
  }

  console.info(
    `[migrate-encrypt-files] done skipped=${skipped} encrypted=${encrypted} missing=${missing} errors=${errors}`
  );
  if (dryRun) {
    console.info("Re-run with --apply to write encrypted files.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
