"use client";

import { useEffect, useRef, useState } from "react";
import type { SignatureField } from "../lib/signatures";

type LocalField = Omit<
  SignatureField,
  "id" | "signedImagePath" | "signedAt" | "sortOrder" | "assignee" | "signedBy"
> & {
  id: string;
  sortOrder: number;
  assigneeUserId?: string | null;
  valueText?: string | null;
};

type EsignPdfViewerProps = {
  pdfUrl: string;
  authToken: string | null;
  fields: LocalField[];
  mode: "place" | "sign" | "view";
  activeFieldId?: string | null;
  /** Object URLs or data URLs keyed by field id — shown inside boxes */
  fieldPreviews?: Record<string, string>;
  /** When set in sign mode, only these fields are clickable */
  interactiveFieldIds?: string[] | null;
  /** Per-field accent colours (assignee) */
  fieldColors?: Record<string, { border: string; fill: string; text: string }>;
  onFieldsChange?: (fields: LocalField[]) => void;
  onFieldActivate?: (fieldId: string) => void;
  /** Admin place: which page “+ Add” should target */
  onPlacePageChange?: (page: number) => void;
  onPageCount?: (count: number) => void;
  /** Fired after pages render successfully for the current pdfUrl */
  onPdfReady?: (info: { url: string; pageCount: number }) => void;
  /** Fired when the current pdfUrl fails to load */
  onPdfError?: (info: { url: string; message: string }) => void;
  zoom?: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

export function EsignPdfViewer({
  pdfUrl,
  authToken,
  fields,
  mode,
  activeFieldId,
  fieldPreviews = {},
  interactiveFieldIds = null,
  fieldColors = {},
  onFieldsChange,
  onFieldActivate,
  onPlacePageChange,
  onPageCount,
  onPdfReady,
  onPdfError,
  zoom = 1,
}: EsignPdfViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pages, setPages] = useState<{ page: number; width: number; height: number; url: string }[]>(
    []
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const onPdfReadyRef = useRef(onPdfReady);
  const onPdfErrorRef = useRef(onPdfError);
  onPdfReadyRef.current = onPdfReady;
  onPdfErrorRef.current = onPdfError;
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    grabOffX: number;
    grabOffY: number;
    width: number;
    height: number;
  } | null>(null);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

        const res = await fetch(pdfUrl, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });
        if (!res.ok) throw new Error("Unable to load PDF");
        const data = await res.arrayBuffer();
        const doc = await pdfjs.getDocument({ data }).promise;
        const rendered: { page: number; width: number; height: number; url: string }[] = [];

        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: 1.25 * zoom });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page
            .render({ canvasContext: ctx, viewport } as Parameters<typeof page.render>[0])
            .promise;
          rendered.push({
            page: i,
            width: viewport.width,
            height: viewport.height,
            url: canvas.toDataURL("image/png"),
          });
        }
        if (!cancelled) {
          setPages(rendered);
          onPageCount?.(rendered.length);
          onPdfReadyRef.current?.({ url: pdfUrl, pageCount: rendered.length });
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "PDF preview failed";
        if (!cancelled) {
          setError(message);
          onPdfErrorRef.current?.({ url: pdfUrl, message });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl, authToken, zoom, onPageCount]);

  function findPageUnderPoint(clientX: number, clientY: number): HTMLElement | null {
    const root = containerRef.current;
    if (!root) return null;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-page]"));
    if (nodes.length === 0) return null;

    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        return el;
      }
    }

    // Between pages / gutter — nearest by vertical center
    let best: HTMLElement | null = null;
    let bestDist = Infinity;
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      const cy = (r.top + r.bottom) / 2;
      const dist = Math.abs(clientY - cy);
      if (dist < bestDist) {
        bestDist = dist;
        best = el;
      }
    }
    return best;
  }

  function onPointerDown(e: React.PointerEvent, field: LocalField) {
    if (mode !== "place" || !onFieldsChange) return;
    const pageEl = (e.currentTarget as HTMLElement).closest("[data-page]") as HTMLElement | null;
    if (!pageEl || !containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const pageRect = pageEl.getBoundingClientRect();
    const fieldRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Capture on scroll container so remounting the box (page change) does not end the drag
    containerRef.current.setPointerCapture(e.pointerId);
    dragRef.current = {
      id: field.id,
      pointerId: e.pointerId,
      grabOffX: (e.clientX - fieldRect.left) / pageRect.width,
      grabOffY: (e.clientY - fieldRect.top) / pageRect.height,
      width: field.width,
      height: field.height,
    };
    onFieldActivate?.(field.id);
    onPlacePageChange?.(field.page);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (mode !== "place" || !dragRef.current || !onFieldsChange) return;
    const d = dragRef.current;
    const pageEl = findPageUnderPoint(e.clientX, e.clientY);
    if (!pageEl) return;
    const page = Number(pageEl.dataset.page) || 1;
    const rect = pageEl.getBoundingClientRect();
    const nx = clamp((e.clientX - rect.left) / rect.width - d.grabOffX, 0, 1 - d.width);
    const ny = clamp((e.clientY - rect.top) / rect.height - d.grabOffY, 0, 1 - d.height);
    const current = fieldsRef.current.find((f) => f.id === d.id);
    if (
      current &&
      current.page === page &&
      Math.abs(current.x - nx) < 0.0005 &&
      Math.abs(current.y - ny) < 0.0005
    ) {
      return;
    }
    onFieldsChange(
      fieldsRef.current.map((f) =>
        f.id === d.id ? { ...f, page, x: nx, y: ny } : f
      )
    );
    onPlacePageChange?.(page);
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!dragRef.current) return;
    if (containerRef.current?.hasPointerCapture(e.pointerId)) {
      containerRef.current.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
  }

  if (loading) return <p className="lead">Loading PDF…</p>;
  if (error) return <div className="error-banner">{error}</div>;

  return (
    <div
      className="esign-pdf-scroll"
      ref={containerRef}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {pages.map((p) => (
        <div
          key={p.page}
          className="esign-pdf-page"
          data-page={p.page}
          style={{ width: p.width, maxWidth: "100%" }}
          onClick={() => {
            if (mode === "place") onPlacePageChange?.(p.page);
          }}
        >
          <img src={p.url} alt={`Page ${p.page}`} className="esign-pdf-img" draggable={false} />
          {fields
            .filter((f) => f.page === p.page)
            .map((f) => {
              const preview = fieldPreviews[f.id];
              const locked =
                mode === "sign" &&
                Array.isArray(interactiveFieldIds) &&
                !interactiveFieldIds.includes(f.id);
              const textPreview =
                !preview && f.valueText ? f.valueText : null;
              const tint = fieldColors[f.id];
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`esign-field-box${activeFieldId === f.id ? " active" : ""}${
                    mode === "place" ? " place" : ""
                  }${preview || textPreview ? " filled" : ""}${locked ? " locked" : ""}`}
                  style={{
                    left: `${f.x * 100}%`,
                    top: `${f.y * 100}%`,
                    width: `${f.width * 100}%`,
                    height: `${f.height * 100}%`,
                    ...(tint && !locked && !preview && !textPreview
                      ? {
                          borderColor: tint.border,
                          background: tint.fill,
                          color: tint.text,
                        }
                      : {}),
                    ...(tint && activeFieldId === f.id
                      ? { boxShadow: `0 0 0 2px ${tint.border}` }
                      : {}),
                  }}
                  disabled={locked && mode === "sign"}
                  onPointerDown={(e) => {
                    if (locked) return;
                    onPointerDown(e, f);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (locked) return;
                    if (mode === "sign" || mode === "view") onFieldActivate?.(f.id);
                    if (mode === "place") {
                      onFieldActivate?.(f.id);
                      onPlacePageChange?.(f.page);
                    }
                  }}
                >
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt="" className="esign-field-ink" draggable={false} />
                  ) : textPreview ? (
                    <span className="esign-field-text">{textPreview}</span>
                  ) : (
                    <span>{f.label || "Signature"}</span>
                  )}
                </button>
              );
            })}
        </div>
      ))}
    </div>
  );
}

export type { LocalField };
