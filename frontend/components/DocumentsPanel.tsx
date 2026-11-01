"use client";

import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { Eye, Upload } from "lucide-react";
import {
  API_URL,
  apiDownload,
  apiFetch,
  apiUpload,
  type DocumentRow,
  type FolderRow,
} from "../lib/api";
import { getToken } from "../lib/auth";
import {
  docFileKind,
  docFileKindLabel,
  isSignedLibraryDocument,
  matchesDocTypeFilter,
  type DocTypeFilter,
} from "../lib/documents";
import { isPdfDocument } from "../lib/signatures";
import { useToast } from "../context/ToastContext";
import { FilePreviewSheet, type FilePreviewTarget } from "./FilePreviewSheet";
import { RowActionsMenu, type RowActionItem } from "./RowActionsMenu";

type DocumentsPanelProps = {
  mode: "client" | "admin";
  organisationId?: string;
  organisationName?: string;
  /** Prefer selecting this folder key on load (e.g. my_onboarding). */
  preferredFolderKey?: string | null;
  onRequestSignature?: (documentId: string, title: string, mimeType: string | null) => void;
};

const formatBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

export const DocumentsPanel = ({
  mode,
  organisationId,
  organisationName,
  preferredFolderKey,
  onRequestSignature,
}: DocumentsPanelProps): ReactElement => {
  const toast = useToast();
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [folderName, setFolderName] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<FilePreviewTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<DocTypeFilter>("all");

  const base =
    mode === "client" ? "/client" : `/admin/organisations/${organisationId}`;

  const resetDocArea = useCallback(() => {
    setFolders([]);
    setActiveFolderId(null);
    setDocuments([]);
    setFolderName("");
    setError("");
    setQuery("");
    setTypeFilter("all");
  }, []);

  const loadFolders = useCallback(async () => {
    if (mode === "admin" && !organisationId) return;
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<{ folders: FolderRow[] }>(`${base}/folders`, {
        token: getToken(),
      });
      if (!result.success) {
        resetDocArea();
        setError(result.error.message);
        return;
      }
      setFolders(result.data.folders);
      setActiveFolderId((prev) => {
        if (prev && result.data.folders.some((f) => f.id === prev)) return prev;
        if (preferredFolderKey) {
          const preferred = result.data.folders.find((f) => f.key === preferredFolderKey);
          if (preferred) return preferred.id;
        }
        return result.data.folders[0]?.id || null;
      });
    } catch {
      resetDocArea();
      setError("Unable to load folders.");
    } finally {
      setLoading(false);
    }
  }, [base, mode, organisationId, preferredFolderKey, resetDocArea]);

  const loadDocuments = useCallback(
    async (folderId: string) => {
      setError("");
      try {
        const result = await apiFetch<{
          folder: { id: string; name: string };
          documents: DocumentRow[];
        }>(`${base}/folders/${folderId}/documents`, { token: getToken() });
        if (!result.success) {
          setDocuments([]);
          setFolderName("");
          setError(result.error.message);
          return;
        }
        setFolderName(result.data.folder.name);
        setDocuments(result.data.documents);
      } catch {
        setDocuments([]);
        setFolderName("");
        setError("Unable to load documents.");
      }
    },
    [base]
  );

  useEffect(() => {
    if (mode !== "admin") return;
    resetDocArea();
  }, [organisationId, mode, resetDocArea]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    if (activeFolderId) {
      loadDocuments(activeFolderId);
      setQuery("");
      setTypeFilter("all");
    } else {
      setDocuments([]);
      setFolderName("");
    }
  }, [activeFolderId, loadDocuments]);

  const filteredDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((doc) => {
      const mime = doc.latestVersion?.mimeType || null;
      const fileName = doc.latestVersion?.fileName || doc.title;
      if (!matchesDocTypeFilter(typeFilter, mime, fileName)) return false;
      if (!q) return true;
      return (
        doc.title.toLowerCase().includes(q) ||
        (doc.latestVersion?.fileName || "").toLowerCase().includes(q)
      );
    });
  }, [documents, query, typeFilter]);

  async function onUpload(file: File | null) {
    if (!file || !activeFolderId) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await apiUpload<{ document: { id: string; title: string } }>(
        `${base}/folders/${activeFolderId}/documents`,
        form,
        getToken()
      );
      if (!result.success) {
        setError(result.error.message);
        toast.error(result.error.message);
        return;
      }
      toast.success(`Uploaded ${result.data.document.title}`);
      await loadDocuments(activeFolderId);
      await loadFolders();
    } catch {
      setError("Upload failed.");
      toast.error("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function onDownload(documentId: string) {
    setError("");
    try {
      const { blob, fileName } = await apiDownload(
        `${base}/documents/${documentId}/download`,
        getToken()
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Download failed";
      setError(msg);
      toast.error(msg);
    }
  }

  async function onDelete(documentId: string, title: string) {
    if (!window.confirm(`Delete “${title}”? This cannot be undone.`)) return;
    setError("");
    try {
      const result = await apiFetch<{ id: string }>(`${base}/documents/${documentId}`, {
        method: "DELETE",
        token: getToken(),
      });
      if (!result.success) {
        setError(result.error.message);
        toast.error(result.error.message);
        return;
      }
      toast.success(`Deleted ${title}`);
      if (activeFolderId) {
        await loadDocuments(activeFolderId);
        await loadFolders();
      }
    } catch {
      setError("Delete failed.");
      toast.error("Delete failed.");
    }
  }

  const openPreview = (
    title: string,
    documentId: string,
    fileName: string,
    mimeType: string | null
  ) => {
    setPreview({
      title,
      url: `${API_URL}${base}/documents/${documentId}/download`,
      fileName,
      mimeType,
    });
  };

  if (mode === "admin" && !organisationId) {
    return (
      <section className="panel">
        <h2>Documents</h2>
        <p className="lead">Select an organisation to browse its folders.</p>
      </section>
    );
  }

  return (
    <div className="docs-layout docs-hub">
      <aside className="docs-folders panel">
        <div className="docs-folders-head">
          <h2>Folders</h2>
          {organisationName ? (
            <p className="docs-folders-org">{organisationName}</p>
          ) : null}
        </div>
        {loading ? <p className="lead">Loading…</p> : null}
        <ul className="folder-list">
          {folders.map((folder) => (
            <li key={folder.id}>
              <button
                type="button"
                className={`folder-btn${activeFolderId === folder.id ? " active" : ""}`}
                onClick={() => setActiveFolderId(folder.id)}
              >
                <span>{folder.name}</span>
                <span className="folder-count">{folder.documentCount}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="panel docs-files">
        <div className="docs-files-head">
          <div className="docs-files-titles">
            <h2>{folderName || "Documents"}</h2>
            <p className="docs-files-sub">
              {documents.length} {documents.length === 1 ? "file" : "files"}
              {filteredDocs.length !== documents.length
                ? ` · showing ${filteredDocs.length}`
                : ""}
            </p>
          </div>
          <label
            className={`btn btn-primary btn-sm upload-btn${uploading || !activeFolderId ? " disabled" : ""}`}
          >
            <Upload size={14} strokeWidth={1.75} aria-hidden />
            {uploading ? "Uploading…" : "Upload"}
            <input
              type="file"
              hidden
              disabled={uploading || !activeFolderId}
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                e.target.value = "";
                onUpload(file);
              }}
            />
          </label>
        </div>

        <div className="docs-toolbar">
          <input
            type="search"
            className="docs-search"
            placeholder="Search this folder…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search documents in this folder"
          />
          <select
            className="docs-type-filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as DocTypeFilter)}
            aria-label="Filter by file type"
          >
            <option value="all">All types</option>
            <option value="pdf">PDF</option>
            <option value="word">Word</option>
          </select>
        </div>

        {error ? <div className="error-banner">{error}</div> : null}

        {documents.length === 0 ? (
          <div className="empty-state docs-empty">
            <p>No files in this folder yet.</p>
            <p className="lead">Upload a PDF or Word document to get started.</p>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="empty-state docs-empty">
            <p>No matches</p>
            <p className="lead">Try a different search or type filter.</p>
          </div>
        ) : (
          <ul className="file-list docs-file-list">
            {filteredDocs.map((doc) => {
              const mime = doc.latestVersion?.mimeType || null;
              const fileName = doc.latestVersion?.fileName || doc.title;
              const kind = docFileKind(mime, fileName);
              const isSignedCopy = isSignedLibraryDocument({
                title: doc.title,
                isSignedCopy: doc.isSignedCopy,
              });
              const canEsign =
                mode === "admin" &&
                Boolean(onRequestSignature) &&
                isPdfDocument(mime, fileName) &&
                !isSignedCopy;

              return (
                <li key={doc.id}>
                  <div className="docs-file-main">
                    <span className={`docs-kind docs-kind-${kind}`} aria-hidden>
                      {docFileKindLabel(kind)}
                    </span>
                    <div className="docs-file-text">
                      <div className="docs-file-title-row">
                        <div className="file-title">{doc.title}</div>
                        {isSignedCopy ? (
                          <span className="status-pill status-pill-ok">Signed</span>
                        ) : null}
                      </div>
                      <div className="file-meta">
                        {doc.latestVersion
                          ? `${doc.latestVersion.fileName} · ${formatBytes(doc.latestVersion.sizeBytes)}`
                          : "—"}
                      </div>
                    </div>
                  </div>
                  <div className="file-actions docs-file-actions">
                    <button
                      type="button"
                      className="shell-icon-btn"
                      title="Preview"
                      aria-label={`Preview ${doc.title}`}
                      onClick={() =>
                        openPreview(doc.title, doc.id, fileName, mime)
                      }
                    >
                      <Eye size={15} strokeWidth={1.75} />
                    </button>
                    <RowActionsMenu
                      label={`Actions for ${doc.title}`}
                      items={(() => {
                        const items: RowActionItem[] = [
                          {
                            id: "download",
                            label: "Download",
                            onSelect: () => onDownload(doc.id),
                          },
                        ];
                        if (canEsign && onRequestSignature) {
                          items.push({
                            id: "esign",
                            label: "Request signature",
                            onSelect: () =>
                              onRequestSignature(doc.id, doc.title, mime),
                          });
                        }
                        items.push({
                          id: "delete",
                          label: "Delete",
                          tone: "danger",
                          separatorBefore: true,
                          onSelect: () => onDelete(doc.id, doc.title),
                        });
                        return items;
                      })()}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <FilePreviewSheet
        target={preview}
        onClose={() => setPreview(null)}
        onDownload={
          preview
            ? () => {
                const match = /\/documents\/([^/?]+)\/download/.exec(preview.url);
                const id = match?.[1];
                if (!id) return;
                onDownload(id);
              }
            : undefined
        }
      />
    </div>
  );
};
