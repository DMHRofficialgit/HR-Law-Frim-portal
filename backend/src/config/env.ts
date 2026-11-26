import dotenv from "dotenv";
import { z } from "zod";
import { decodeAes256Key, SecretCryptoError } from "../lib/secret-crypto";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  JWT_SECRET: z.string().min(8),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  STORAGE_ROOT: z.string().default("./storage"),
  /** Base64 AES-256 key for SMTP mailbox password at rest. Empty in .env.example only. */
  SMTP_SECRET_KEY: z.string().optional().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const rawSmtpKey = parsed.data.SMTP_SECRET_KEY.trim();

if (parsed.data.NODE_ENV === "production" && !rawSmtpKey) {
  console.error(
    "Invalid environment variables: SMTP_SECRET_KEY is required in production (openssl rand -base64 32)"
  );
  process.exit(1);
}

let smtpSecretKeyBytes: Buffer | null = null;
if (rawSmtpKey) {
  try {
    smtpSecretKeyBytes = decodeAes256Key(rawSmtpKey, "SMTP_SECRET_KEY");
  } catch (err) {
    const message =
      err instanceof SecretCryptoError ? err.message : "SMTP_SECRET_KEY is invalid";
    console.error("Invalid environment variables:", message);
    process.exit(1);
  }
}

export const env = {
  ...parsed.data,
  /** Decoded 32-byte key, or null when unset (non-production only). */
  smtpSecretKeyBytes,
};

/** Throws a safe error if the SMTP encryption key is not loaded. */
export function requireSmtpSecretKey(): Buffer {
  if (!env.smtpSecretKeyBytes) {
    throw new SecretCryptoError(
      "SMTP_SECRET_KEY is not configured — set a 32-byte base64 key before saving or using SMTP passwords"
    );
  }
  return env.smtpSecretKeyBytes;
}
