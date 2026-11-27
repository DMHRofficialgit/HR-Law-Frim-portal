import fs from "fs/promises";
import path from "path";
import { env, requireFileSecretKey } from "../../config/env";
import { isEncryptedFileBlob, unwrapStoredFileBytes, wrapStoredFileBytes } from "../file-crypto";
import type { StorageDriver } from "./types";

function storageRoot() {
  return path.resolve(env.STORAGE_ROOT);
}

function absoluteKeyPath(key: string) {
  const root = storageRoot();
  const absolute = path.resolve(root, key);
  if (!absolute.startsWith(root)) {
    throw new Error("Invalid storage path");
  }
  return absolute;
}

async function ensureParent(absolute: string) {
  await fs.mkdir(path.dirname(absolute), { recursive: true });
}

export function createLocalDriver(): StorageDriver {
  return {
    async put(key, plaintext) {
      const normalized = key.replace(/\\/g, "/");
      const absolute = absoluteKeyPath(normalized);
      await ensureParent(absolute);
      // Production always has FILE_SECRET_KEY (env boot check). Dev may write plaintext until set.
      const sealed = env.fileSecretKeyBytes
        ? wrapStoredFileBytes(plaintext, env.fileSecretKeyBytes)
        : plaintext;
      await fs.writeFile(absolute, sealed);
      return normalized;
    },

    async getCiphertextBuffer(key) {
      return fs.readFile(absoluteKeyPath(key.replace(/\\/g, "/")));
    },

    async getBuffer(key) {
      const raw = await this.getCiphertextBuffer(key);
      const keyBytes = isEncryptedFileBlob(raw) ? requireFileSecretKey() : env.fileSecretKeyBytes;
      return unwrapStoredFileBytes(raw, keyBytes);
    },

    async remove(key) {
      try {
        await fs.unlink(absoluteKeyPath(key.replace(/\\/g, "/")));
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") throw err;
      }
    },

    async exists(key) {
      try {
        await fs.access(absoluteKeyPath(key.replace(/\\/g, "/")));
        return true;
      } catch {
        return false;
      }
    },
  };
}

export { storageRoot, absoluteKeyPath };
