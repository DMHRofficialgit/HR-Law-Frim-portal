import fs from "fs";
import fsPromises from "fs/promises";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { storageRoot } from "../lib/storage";
import { getUploadSettings } from "../lib/uploadSettings";

function tempUploadDir() {
  if (env.UPLOAD_TEMP_DIR.trim()) {
    return path.resolve(env.UPLOAD_TEMP_DIR.trim());
  }
  return path.join(storageRoot(), ".tmp-uploads");
}

const disk = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = tempUploadDir();
      fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").slice(0, 20);
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 20,
  },
});

export const singleUpload = disk.single("file");
export const anyUpload = disk.any();

export function multiUpload(fieldName = "files", maxCount = 20) {
  return disk.array(fieldName, maxCount);
}

export async function maxConfiguredBytes() {
  const settings = await getUploadSettings();
  return settings.maxUploadBytes;
}

/** Read multer disk file into a buffer, then delete the temp file. */
export async function consumeUploadedFile(
  file: Express.Multer.File
): Promise<{ buffer: Buffer; originalName: string; mimeType: string; size: number }> {
  const buffer = await fsPromises.readFile(file.path);
  await fsPromises.unlink(file.path).catch(() => undefined);
  return {
    buffer,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
  };
}

/** Best-effort cleanup if handler fails before consumeUploadedFile. */
export async function discardUploadedFile(file?: Express.Multer.File | null) {
  if (!file?.path) return;
  await fsPromises.unlink(file.path).catch(() => undefined);
}

export async function discardUploadedFiles(files?: Express.Multer.File[] | null) {
  if (!files?.length) return;
  await Promise.all(files.map((f) => discardUploadedFile(f)));
}

/**
 * Wrap an upload middleware so temp files are removed if the route throws
 * before consuming them.
 */
export function withUploadCleanup(
  uploadMw: (req: Request, res: Response, next: NextFunction) => void
) {
  return (req: Request, res: Response, next: NextFunction) => {
    uploadMw(req, res, (err?: unknown) => {
      if (err) return next(err);
      const prev = res.end.bind(res);
      res.end = ((...args: Parameters<typeof res.end>) => {
        const files: Express.Multer.File[] = [];
        if (req.file) files.push(req.file);
        if (Array.isArray(req.files)) files.push(...req.files);
        void discardUploadedFiles(files);
        return prev(...args);
      }) as typeof res.end;
      next();
    });
  };
}
