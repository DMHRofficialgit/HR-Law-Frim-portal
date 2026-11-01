"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { getToken } from "../lib/auth";

export type FilePreviewTarget = {
  title: string;
  /** Authenticated URL that returns the file bytes */
  url: string;
  fileName?: string | null;
  mimeType?: string | null;
};

type FilePreviewSheetProps = {
  target: FilePreviewTarget | null;
  onClose: () => void;
  /** Optional download handler (defaults to opening blob download) */
  onDownload?: () => void;
};

function isPdf(mime?: string | null, name?: string | null) {
  const m = (mime || "").toLowerCase();
  const n = (name || "").toLowerCase();
  return m.includes("pdf") || n.endsWith(".pdf");
}

function isImage(mime?: string | null, name?: string | null) {
  const m = (mime || "").toLowerCase();
  const n = (name || "").toLowerCase();
  if (m.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(n);
}

export function FilePreviewSheet({ target, onClose, onDownload }: FilePreviewSheetProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [pdfPages, setPdfPages] = useState<string[]>([]);
  const [kind, setKind] = useState<"pdf" | "image" | "other">("other");

  useEffect(() => {
    if (!target) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [target, onClose]);

  useEffect(() => {
    if (!target) {
      setObjectUrl(null);
      setPdfPages([]);
      setError("");
      return;
    }

    let cancelled = false;
    let createdUrl: string | null = null;

    async function load() {
      setLoading(true);
      setError("");
      setPdfPages([]);
      setObjectUrl(null);

      const mime = target!.mimeType;
      const name = target!.fileName || target!.title;
      const pdf = isPdf(mime, name);
      const image = isImage(mime, name);
      setKind(pdf ? "pdf" : image ? "image" : "other");

      try {
        const token = getToken();
        const res = await fetch(target!.url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error("Unable to load file");
        const blob = await res.blob();
        if (cancelled) return;

        if (pdf) {
          const pdfjs = await import("pdfjs-dist");
          pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
          const data = await blob.arrayBuffer();
          const doc = await pdfjs.getDocument({ data }).promise;
          const pages: string[] = [];
          const maxPages = Math.min(doc.numPages, 40);
          for (let i = 1; i <= maxPages; i++) {
            const page = await doc.getPage(i);
            const viewport = page.getViewport({ scale: 1.2 });
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) continue;
            await page
              .render({ canvasContext: ctx, viewport } as Parameters<typeof page.render>[0])
              .promise;
            pages.push(canvas.toDataURL("image/png"));
          }
          if (!cancelled) setPdfPages(pages);
        } else if (image) {
          createdUrl = URL.createObjectURL(blob);
          if (!cancelled) setObjectUrl(createdUrl);
        } else {
          createdUrl = URL.createObjectURL(blob);
          if (!cancelled) setObjectUrl(createdUrl);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Preview failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [target]);

  if (!target) return null;

  function handleDownload() {
    if (onDownload) {
      onDownload();
      return;
    }
    if (!objectUrl) return;
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = target!.fileName || target!.title || "download";
    a.click();
  }

  return (
    <div
      className="file-preview-root"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        className="file-preview-backdrop"
        aria-label="Close preview"
        onClick={onClose}
      />
      <div
        className="file-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Preview ${target.title}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="file-preview-head">
          <div className="file-preview-head-text">
            <strong>{target.title}</strong>
            {target.fileName ? <span>{target.fileName}</span> : null}
          </div>
          <div className="file-preview-head-actions">
            {kind !== "other" || objectUrl ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleDownload}
              >
                <Download size={14} strokeWidth={1.75} aria-hidden />
                Download
              </button>
            ) : null}
            <button
              type="button"
              className="shell-icon-btn"
              aria-label="Close preview"
              onClick={onClose}
            >
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>
        </header>

        <div className="file-preview-body dmhr-scroll">
          {loading ? <p className="file-preview-status">Loading preview…</p> : null}
          {error ? <p className="file-preview-status error">{error}</p> : null}

          {!loading && !error && kind === "pdf" ? (
            <div className="file-preview-pdf">
              {pdfPages.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt={`Page ${i + 1}`} className="file-preview-page" />
              ))}
              {!pdfPages.length ? (
                <p className="file-preview-status">No pages to show.</p>
              ) : null}
            </div>
          ) : null}

          {!loading && !error && kind === "image" && objectUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={objectUrl} alt={target.title} className="file-preview-image" />
          ) : null}

          {!loading && !error && kind === "other" ? (
            <div className="file-preview-fallback">
              <p>In-portal preview isn’t available for this file type.</p>
              <p className="lead">Download to open it on your device.</p>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleDownload}>
                <Download size={14} strokeWidth={1.75} aria-hidden />
                Download file
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
