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
  /** Proxy hops in front of Node (Render/DO edge ≈ 1). Never use `true`. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  RATE_LIMIT_LOGIN_IP_MAX: z.coerce.number().int().min(5).max(200).default(30),
  RATE_LIMIT_LOGIN_EMAIL_MAX: z.coerce.number().int().min(3).max(100).default(10),
  RATE_LIMIT_INVITE_IP_MAX: z.coerce.number().int().min(10).max(300).default(60),
  RATE_LIMIT_SET_PASSWORD_IP_MAX: z.coerce.number().int().min(5).max(100).default(20),
  RATE_LIMIT_SET_PASSWORD_TOKEN_MAX: z.coerce.number().int().min(3).max(50).default(10),
  RATE_LIMIT_CHANGE_PASSWORD_MAX: z.coerce.number().int().min(3).max(50).default(10),
  RATE_LIMIT_REFRESH_IP_MAX: z.coerce.number().int().min(10).max(500).default(120),
  /** First-access invite link lifetime (hours). */
  INVITE_TOKEN_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(72),
  /** Password-reset link lifetime (minutes). */
  RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(20),
  /** Short-lived access JWT lifetime (minutes). */
  JWT_ACCESS_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
  /** End session after this many minutes without activity. */
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(240).default(30),
  /** Hard max session length from login (hours). */
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(24).default(8),
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

if (parsed.data.NODE_ENV === "production" && parsed.data.JWT_SECRET.length < 32) {
  console.error(
    "Invalid environment variables: JWT_SECRET must be at least 32 characters in production"
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
