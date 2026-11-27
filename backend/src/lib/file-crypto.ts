import crypto from "crypto";
import { SecretCryptoError } from "./secret-crypto";

/**
 * Binary AES-256-GCM for stored files (#2).
 * Layout: magic(5) | keyVersion u16 BE | iv(12) | tag(16) | ciphertext
 */

export const FILE_CRYPTO_MAGIC = Buffer.from("DMHR1", "ascii");
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;
const HEADER_LEN = FILE_CRYPTO_MAGIC.length + 2 + IV_BYTES + AUTH_TAG_BYTES;

export function isEncryptedFileBlob(data: Buffer): boolean {
  if (data.length < HEADER_LEN) return false;
  return data.subarray(0, FILE_CRYPTO_MAGIC.length).equals(FILE_CRYPTO_MAGIC);
}

export function encryptFileBytes(
  plaintext: Buffer,
  key: Buffer,
  keyVersion = 1
): Buffer {
  if (!plaintext.length) {
    throw new SecretCryptoError("Cannot encrypt empty file");
  }
  if (key.length !== KEY_BYTES) {
    throw new SecretCryptoError("Invalid file encryption key length");
  }
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  if (tag.length !== AUTH_TAG_BYTES) {
    throw new SecretCryptoError("Unexpected auth tag length");
  }
  const header = Buffer.alloc(FILE_CRYPTO_MAGIC.length + 2);
  FILE_CRYPTO_MAGIC.copy(header, 0);
  header.writeUInt16BE(keyVersion & 0xffff, FILE_CRYPTO_MAGIC.length);
  return Buffer.concat([header, iv, tag, ciphertext]);
}

export function decryptFileBytes(blob: Buffer, key: Buffer): Buffer {
  if (!isEncryptedFileBlob(blob)) {
    throw new SecretCryptoError("File is not in encrypted DMHR1 format");
  }
  if (key.length !== KEY_BYTES) {
    throw new SecretCryptoError("Invalid file decryption key length");
  }
  const keyVersionOffset = FILE_CRYPTO_MAGIC.length;
  const ivStart = keyVersionOffset + 2;
  const tagStart = ivStart + IV_BYTES;
  const dataStart = tagStart + AUTH_TAG_BYTES;
  const iv = blob.subarray(ivStart, tagStart);
  const tag = blob.subarray(tagStart, dataStart);
  const data = blob.subarray(dataStart);
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  } catch {
    throw new SecretCryptoError("Unable to decrypt file");
  }
}

/**
 * Decrypt if encrypted; otherwise return plaintext (legacy files pre-migrate).
 */
export function unwrapStoredFileBytes(blob: Buffer, key: Buffer | null): Buffer {
  if (!isEncryptedFileBlob(blob)) {
    return blob;
  }
  if (!key) {
    throw new SecretCryptoError(
      "FILE_SECRET_KEY is not configured — cannot decrypt stored file"
    );
  }
  return decryptFileBytes(blob, key);
}

export function wrapStoredFileBytes(plaintext: Buffer, key: Buffer | null): Buffer {
  if (!key) {
    throw new SecretCryptoError(
      "FILE_SECRET_KEY is not configured — cannot encrypt stored file"
    );
  }
  return encryptFileBytes(plaintext, key);
}
