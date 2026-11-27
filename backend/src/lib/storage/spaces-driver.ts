import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env, requireFileSecretKey } from "../../config/env";
import {
  isEncryptedFileBlob,
  unwrapStoredFileBytes,
  wrapStoredFileBytes,
} from "../file-crypto";
import type { StorageDriver } from "./types";

function objectKey(key: string) {
  const prefix = (env.SPACES_PREFIX || "").replace(/^\/+|\/+$/g, "");
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  return prefix ? `${prefix}/${normalized}` : normalized;
}

export function createSpacesDriver(): StorageDriver {
  if (!env.SPACES_BUCKET || !env.SPACES_ENDPOINT || !env.SPACES_KEY || !env.SPACES_SECRET) {
    throw new Error(
      "STORAGE_DRIVER=spaces requires SPACES_ENDPOINT, SPACES_BUCKET, SPACES_KEY, SPACES_SECRET"
    );
  }

  const client = new S3Client({
    region: env.SPACES_REGION || "us-east-1",
    endpoint: env.SPACES_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.SPACES_KEY,
      secretAccessKey: env.SPACES_SECRET,
    },
  });

  const bucket = env.SPACES_BUCKET;

  return {
    async put(key, plaintext) {
      const normalized = key.replace(/\\/g, "/");
      const sealed = wrapStoredFileBytes(plaintext, requireFileSecretKey());
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey(normalized),
          Body: sealed,
          ContentType: "application/octet-stream",
        })
      );
      return normalized;
    },

    async getCiphertextBuffer(key) {
      const normalized = key.replace(/\\/g, "/");
      const out = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: objectKey(normalized),
        })
      );
      const bytes = await out.Body?.transformToByteArray();
      if (!bytes) throw new Error(`Empty object for key ${normalized}`);
      return Buffer.from(bytes);
    },

    async getBuffer(key) {
      const raw = await this.getCiphertextBuffer(key);
      const keyBytes = isEncryptedFileBlob(raw) ? requireFileSecretKey() : env.fileSecretKeyBytes;
      return unwrapStoredFileBytes(raw, keyBytes);
    },

    async remove(key) {
      const normalized = key.replace(/\\/g, "/");
      try {
        await client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: objectKey(normalized),
          })
        );
      } catch {
        /* ignore missing */
      }
    },

    async exists(key) {
      try {
        await client.send(
          new HeadObjectCommand({
            Bucket: bucket,
            Key: objectKey(key.replace(/\\/g, "/")),
          })
        );
        return true;
      } catch {
        return false;
      }
    },
  };
}
