export type DocFileKind = "pdf" | "docx" | "doc" | "file";

export const docFileKind = (
  mimeType?: string | null,
  fileName?: string | null
): DocFileKind => {
  const mime = (mimeType || "").toLowerCase();
  const name = (fileName || "").toLowerCase();
  if (mime.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (
    mime.includes("wordprocessingml") ||
    mime.includes("opendocument.text") ||
    name.endsWith(".docx")
  ) {
    return "docx";
  }
  if (mime === "application/msword" || name.endsWith(".doc")) return "doc";
  return "file";
};

export const docFileKindLabel = (kind: DocFileKind): string => {
  if (kind === "pdf") return "PDF";
  if (kind === "docx") return "DOCX";
  if (kind === "doc") return "DOC";
  return "FILE";
};

export type DocTypeFilter = "all" | "pdf" | "word";

export const matchesDocTypeFilter = (
  filter: DocTypeFilter,
  mimeType?: string | null,
  fileName?: string | null
): boolean => {
  if (filter === "all") return true;
  const kind = docFileKind(mimeType, fileName);
  if (filter === "pdf") return kind === "pdf";
  return kind === "docx" || kind === "doc";
};

/**
 * Prefer DB `isSignedCopy`. Title patterns are fallback for older rows
 * (em-dash publish title or sanitized filename variants).
 */
export const isSignedLibraryDocument = (params: {
  title?: string | null;
  isSignedCopy?: boolean | null;
}): boolean => {
  if (params.isSignedCopy) return true;
  const title = params.title || "";
  return (
    title.includes(" — Signed — ") ||
    title.includes(" _ Signed _ ") ||
    title.includes(" - Signed - ")
  );
};
