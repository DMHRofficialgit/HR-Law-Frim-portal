import { Readable } from "stream";
import { env } from "../../config/env";
import { createLocalDriver, storageRoot as localRoot } from "./local-driver";
import { createSpacesDriver } from "./spaces-driver";
import type { StorageDriver } from "./types";

let driver: StorageDriver | null = null;

export function getStorageDriver(): StorageDriver {
  if (driver) return driver;
  if (env.STORAGE_DRIVER === "spaces") {
    driver = createSpacesDriver();
  } else {
    driver = createLocalDriver();
  }
  return driver;
}

/** @deprecated test helper — reset cached driver */
export function resetStorageDriver() {
  driver = null;
}

export function storageRoot() {
  return localRoot();
}

/**
 * Encrypt + store plaintext under relativeDir/fileName.
 * Returns relative key (forward slashes) for DB storage_path.
 */
export async function writeStoredFile(
  relativeDir: string,
  fileName: string,
  data: Buffer
): Promise<string> {
  const dir = relativeDir.split(/[/\\]/).filter(Boolean).join("/");
  const key = dir ? `${dir}/${fileName}` : fileName;
  return getStorageDriver().put(key, data);
}

/** Decrypt (or pass-through legacy plaintext) and return bytes. */
export async function readStoredFile(relativePath: string): Promise<Buffer> {
  return getStorageDriver().getBuffer(relativePath);
}

/** Plaintext stream for HTTP download/preview. */
export async function openStoredFileStream(relativePath: string): Promise<Readable> {
  const buf = await readStoredFile(relativePath);
  return Readable.from(buf);
}

export async function removeStoredFile(relativePath: string): Promise<void> {
  await getStorageDriver().remove(relativePath);
}

/**
 * Local absolute path helper — only valid for STORAGE_DRIVER=local.
 * Prefer readStoredFile / openStoredFileStream for product code.
 */
export function absoluteStoragePath(relativePath: string): string {
  if (env.STORAGE_DRIVER !== "local") {
    throw new Error("absoluteStoragePath is only available when STORAGE_DRIVER=local");
  }
  const path = require("path") as typeof import("path");
  const root = localRoot();
  const absolute = path.resolve(root, relativePath);
  if (!absolute.startsWith(root)) {
    throw new Error("Invalid storage path");
  }
  return absolute;
}

export async function ensureStorageDir(...segments: string[]) {
  const path = await import("path");
  const fs = await import("fs/promises");
  const dir = path.join(localRoot(), ...segments);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}
