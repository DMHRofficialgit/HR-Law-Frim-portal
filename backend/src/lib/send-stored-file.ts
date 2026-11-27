import type { Response } from "express";
import { openStoredFileStream, readStoredFile } from "./storage";

/** Stream decrypted stored object to the HTTP response. */
export async function sendStoredFile(
  res: Response,
  relativePath: string,
  opts: { mimeType: string; fileName?: string; disposition?: "inline" | "attachment" }
): Promise<void> {
  const stream = await openStoredFileStream(relativePath);
  res.setHeader("Content-Type", opts.mimeType || "application/octet-stream");
  if (opts.fileName) {
    const kind = opts.disposition || "attachment";
    res.setHeader(
      "Content-Disposition",
      `${kind}; filename="${encodeURIComponent(opts.fileName)}"`
    );
  }
  stream.pipe(res);
}

/** Load decrypted bytes (PDF stamp, e-sign, etc.). */
export async function loadStoredFileBytes(relativePath: string): Promise<Buffer> {
  return readStoredFile(relativePath);
}
