import type { PDFDocumentProxy } from "pdfjs-dist";

/** Self-hosted worker — never load from unpkg/CDN (#8). */
export const PDFJS_WORKER_SRC = "/pdfjs/pdf.worker.min.mjs";

let workerConfigured = false;

/**
 * Dynamically import pdfjs-dist and point the worker at our origin.
 * Call once per load path (Eye preview + e-sign).
 */
export async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!workerConfigured || pdfjs.GlobalWorkerOptions.workerSrc !== PDFJS_WORKER_SRC) {
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
    workerConfigured = true;
  }
  return pdfjs;
}

export async function openPdfDocument(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument({ data }).promise;
}
