/**
 * Keeps public/pdfjs/pdf.worker.min.mjs in sync with the installed pdfjs-dist version.
 * Runs from postinstall so deploys never fall back to a CDN worker.
 */
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const destDir = join(root, "public", "pdfjs");
const dest = join(destDir, "pdf.worker.min.mjs");

if (!existsSync(src)) {
  console.warn("[copy-pdfjs-worker] pdfjs-dist worker not found — skip copy");
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.info("[copy-pdfjs-worker] wrote", dest);
