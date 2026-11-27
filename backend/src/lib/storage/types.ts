import type { Readable } from "stream";

export type StorageDriver = {
  put(key: string, plaintext: Buffer): Promise<string>;
  getBuffer(key: string): Promise<Buffer>;
  getCiphertextBuffer(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
};

export type StoredObjectMeta = {
  key: string;
  sizeBytes: number;
};

export type { Readable };
