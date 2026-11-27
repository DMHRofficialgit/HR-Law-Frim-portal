/**
 * Re-export storage facade (encrypted local / Spaces).
 * Prefer importing from this path so existing call sites keep working.
 */
export {
  absoluteStoragePath,
  ensureStorageDir,
  getStorageDriver,
  openStoredFileStream,
  readStoredFile,
  removeStoredFile,
  resetStorageDriver,
  storageRoot,
  writeStoredFile,
} from "./storage/index";
