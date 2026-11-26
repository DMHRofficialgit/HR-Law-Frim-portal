/**
 * One-off: encrypt legacy plain SMTP password in DB.
 * Requires SMTP_SECRET_KEY in env (openssl rand -base64 32).
 *
 *   npx tsx src/scripts/encrypt-smtp-password.ts
 */
import { requireSmtpSecretKey } from "../config/env";
import { prisma } from "../lib/prisma";
import { encryptSecret, isEncryptedSecretBlob } from "../lib/secret-crypto";

async function main() {
  const key = requireSmtpSecretKey();
  const row = await prisma.smtpSettings.findUnique({ where: { id: "default" } });
  if (!row?.password) {
    console.log("No SMTP password stored — nothing to encrypt.");
    return;
  }
  if (isEncryptedSecretBlob(row.password)) {
    console.log("SMTP password already encrypted — nothing to do.");
    return;
  }

  const encrypted = encryptSecret(row.password, key, 1);
  await prisma.smtpSettings.update({
    where: { id: "default" },
    data: { password: encrypted },
  });
  console.log("SMTP password encrypted at rest (v1).");
}

main()
  .catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("encrypt-smtp-password failed:", message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
