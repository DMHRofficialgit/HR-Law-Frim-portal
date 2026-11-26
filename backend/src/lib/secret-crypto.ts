import crypto from "crypto";

/**
 * AES-256-GCM helpers for secrets at rest (SMTP #3; documents #2 later).
 * Wire format: v1:<keyVersion>:<iv_b64>:<tag_b64>:<cipher_b64>
 * Cursor must never generate production keys — load from env only.
 */

const PREFIX = "v1:";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const AUTH_TAG_BYTES = 16;

export class SecretCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretCryptoError";
  }
}

/** Decode SMTP_SECRET_KEY / DOC_ENCRYPTION_KEY (base64 → 32 bytes). */
export function decodeAes256Key(base64Key: string, label: string): Buffer {
  const trimmed = base64Key.trim();
  if (!trimmed) {
    throw new SecretCryptoError(`${label} is missing`);
  }
  let key: Buffer;
  try {
    key = Buffer.from(trimmed, "base64");
  } catch {
    throw new SecretCryptoError(`${label} is not valid base64`);
  }
  if (key.length !== KEY_BYTES) {
    throw new SecretCryptoError(`${label} must decode to exactly ${KEY_BYTES} bytes`);
  }
  return key;
}

export function isEncryptedSecretBlob(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptSecret(
  plaintext: string,
  key: Buffer,
  keyVersion = 1
): string {
  if (!plaintext) {
    throw new SecretCryptoError("Cannot encrypt empty secret");
  }
  if (key.length !== KEY_BYTES) {
    throw new SecretCryptoError("Invalid encryption key length");
  }
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  if (tag.length !== AUTH_TAG_BYTES) {
    throw new SecretCryptoError("Unexpected auth tag length");
  }
  return [
    "v1",
    String(keyVersion),
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptSecret(blob: string, key: Buffer): string {
  if (!isEncryptedSecretBlob(blob)) {
    throw new SecretCryptoError("Secret is not in encrypted v1 format");
  }
  const parts = blob.split(":");
  // v1 : keyVersion : iv : tag : cipher  → 5 parts when joined with :
  if (parts.length !== 5 || parts[0] !== "v1") {
    throw new SecretCryptoError("Malformed encrypted secret");
  }
  const iv = Buffer.from(parts[2], "base64");
  const tag = Buffer.from(parts[3], "base64");
  const data = Buffer.from(parts[4], "base64");
  if (iv.length !== IV_BYTES || tag.length !== AUTH_TAG_BYTES) {
    throw new SecretCryptoError("Malformed encrypted secret payload");
  }
  if (key.length !== KEY_BYTES) {
    throw new SecretCryptoError("Invalid decryption key length");
  }
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    throw new SecretCryptoError("Unable to decrypt secret");
  }
}
