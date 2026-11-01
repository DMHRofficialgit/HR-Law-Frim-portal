import fs from "fs/promises";
import path from "path";
import { env } from "../config/env";

export function storageRoot() {
  return path.resolve(env.STORAGE_ROOT);
}

export async function ensureStorageDir(...segments: string[]) {
  const dir = path.join(storageRoot(), ...segments);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function absoluteStoragePath(relativePath: string) {
  const root = storageRoot();
  const absolute = path.resolve(root, relativePath);
  if (!absolute.startsWith(root)) {
    throw new Error("Invalid storage path");
  }
  return absolute;
}

export async function writeStoredFile(
  relativeDir: string,
  fileName: string,
  data: Buffer
) {
  const dir = await ensureStorageDir(...relativeDir.split(/[/\\]/).filter(Boolean));
  const absolute = path.join(dir, fileName);
  await fs.writeFile(absolute, data);
  return path.relative(storageRoot(), absolute).replace(/\\/g, "/");
}

export async function removeStoredFile(relativePath: string) {
  try {
    await fs.unlink(absoluteStoragePath(relativePath));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
  }
}
