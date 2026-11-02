"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import {
  Download,
  Eye,
  FileSignature,
  Pencil,
  Trash2,
} from "lucide-react";
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
import { DocsDropzone } from "./DocsDropzone";
import { FilePreviewSheet, type FilePreviewTarget } from "./FilePreviewSheet";
import { IconButton } from "./IconButton";
import { PortalSelect } from "./PortalSelect";

type DocumentsPanelProps = {
  mode: "client" | "admin";
  organisationId?: string;
  organisationName?: string;
  /** Prefer selecting this folder key on load (e.g. my_onboarding). */
  preferredFolderKey?: string | null;
  onRequestSignature?: (documentId: string, title: string, mimeType: string | null) => void;
};

type UploadSettings = {
  allowedExtensions: string[];
  allowedMimeTypes: string[];
  maxUploadBytes: number;
};

type SortKey = "name" | "size" | "date";

const formatBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const DEFAULT_SETTINGS: UploadSettings = {
  allowedExtensions: ["pdf"],
  allowedMimeTypes: ["application/pdf"],
  maxUploadBytes: 25 * 1024 * 1024,
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
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [uploadSettings, setUploadSettings] =
    useState<UploadSettings>(DEFAULT_SETTINGS);

  const base =
    mode === "client" ? "/client" : `/admin/organisations/${organisationId}`;
  const settingsPath =
    mode === "client" ? "/client/upload-settings" : "/admin/upload-settings";

  const acceptAttr = useMemo(() => {
    const exts = uploadSettings.allowedExtensions.map((e) => `.${e.replace(/^\./, "")}`);
    return [...exts, ...uploadSettings.allowedMimeTypes].join(",");
  }, [uploadSettings]);

  const dropHint = useMemo(() => {
    const types = uploadSettings.allowedExtensions
      .map((e) => e.toUpperCase())
      .join(" · ");
    return `${types} · up to ${formatBytes(uploadSettings.maxUploadBytes)} each`;
  }, [uploadSettings]);

  const resetDocArea = useCallback(() => {
    setFolders([]);
    setActiveFolderId(null);
    setDocuments([]);
    setFolderName("");
    setError("");
    setQuery("");
    setTypeFilter("all");
    setSelectedIds(new Set());
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

  const loadUploadSettings = useCallback(async () => {
    try {
      const result = await apiFetch<{ settings: UploadSettings }>(settingsPath, {
        token: getToken(),
      });
      if (result.success && result.data.settings) {
        setUploadSettings({
          allowedExtensions: result.data.settings.allowedExtensions?.length
            ? result.data.settings.allowedExtensions
            : DEFAULT_SETTINGS.allowedExtensions,
          allowedMimeTypes: result.data.settings.allowedMimeTypes?.length
            ? result.data.settings.allowedMimeTypes
            : DEFAULT_SETTINGS.allowedMimeTypes,
          maxUploadBytes:
            result.data.settings.maxUploadBytes || DEFAULT_SETTINGS.maxUploadBytes,
        });
      }
    } catch {
      /* keep defaults */
    }
  }, [settingsPath]);

  useEffect(() => {
    if (mode !== "admin") return;
    resetDocArea();
  }, [organisationId, mode, resetDocArea]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    loadUploadSettings();
  }, [loadUploadSettings]);

  useEffect(() => {
    if (activeFolderId) {
      loadDocuments(activeFolderId);
      setQuery("");
      setTypeFilter("all");
      setSelectedIds(new Set());
    } else {
      setDocuments([]);
      setFolderName("");
      setSelectedIds(new Set());
    }
  }, [activeFolderId, loadDocuments]);

  const visibleDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = documents.filter((doc) => {
      const mime = doc.latestVersion?.mimeType || null;
      const fileName = doc.latestVersion?.fileName || doc.title;
      if (!matchesDocTypeFilter(typeFilter, mime, fileName)) return false;
      if (!q) return true;
      return (
        doc.title.toLowerCase().includes(q) ||
        (doc.latestVersion?.fileName || "").toLowerCase().includes(q)
      );
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortKey === "size") {
        return (b.latestVersion?.sizeBytes || 0) - (a.latestVersion?.sizeBytes || 0);
      }
      if (sortKey === "date") {
        const ta = new Date(a.updatedAt || a.latestVersion?.createdAt || 0).getTime();
        const tb = new Date(b.updatedAt || b.latestVersion?.createdAt || 0).getTime();
        return tb - ta;
      }
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    });
    return sorted;
  }, [documents, query, typeFilter, sortKey]);

  const allVisibleSelected =
    visibleDocs.length > 0 && visibleDocs.every((d) => selectedIds.has(d.id));

  const fileAllowed = (file: File): string | null => {
    const ext = file.name.includes(".")
      ? file.name.split(".").pop()?.toLowerCase() || ""
      : "";
    const extOk =
      uploadSettings.allowedExtensions.length === 0 ||
      uploadSettings.allowedExtensions.map((e) => e.toLowerCase()).includes(ext);
    const mimeOk =
      uploadSettings.allowedMimeTypes.length === 0 ||
      !file.type ||
      uploadSettings.allowedMimeTypes.includes(file.type);
    if (!extOk && !mimeOk) {
      return `${file.name}: type not allowed (${uploadSettings.allowedExtensions.join(", ")})`;
    }
    if (file.size > uploadSettings.maxUploadBytes) {
      return `${file.name}: exceeds ${formatBytes(uploadSettings.maxUploadBytes)}`;
    }
    return null;
  };

  async function onUploadFiles(files: File[]) {
    if (!activeFolderId || files.length === 0) return;
    setUploading(true);
    setError("");
    let ok = 0;
    const failures: string[] = [];

    for (const file of files) {
      const blocked = fileAllowed(file);
      if (blocked) {
        failures.push(blocked);
        continue;
      }
      try {
        const form = new FormData();
        form.append("file", file);
        const result = await apiUpload<{ document: { id: string; title: string } }>(
          `${base}/folders/${activeFolderId}/documents`,
          form,
          getToken()
        );
        if (!result.success) {
          failures.push(`${file.name}: ${result.error.message}`);
        } else {
          ok += 1;
        }
      } catch {
        failures.push(`${file.name}: upload failed`);
      }
    }

    if (ok > 0) {
      toast.success(ok === 1 ? "Uploaded 1 file" : `Uploaded ${ok} files`);
      await loadDocuments(activeFolderId);
      await loadFolders();
    }
    if (failures.length > 0) {
      const msg = failures.slice(0, 3).join(" · ");
      setError(msg);
      toast.error(msg);
    }
    setUploading(false);
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

  async function onRename(documentId: string, currentTitle: string) {
    const next = window.prompt("Rename document", currentTitle);
    if (next === null) return;
    const title = next.trim();
    if (!title) {
      toast.error("Title is required.");
      return;
    }
    if (title === currentTitle) return;
    setError("");
    try {
      const result = await apiFetch<{ document: { id: string; title: string } }>(
        `${base}/documents/${documentId}`,
        {
          method: "PATCH",
          token: getToken(),
          body: JSON.stringify({ title }),
        }
      );
      if (!result.success) {
        setError(result.error.message);
        toast.error(result.error.message);
        return;
      }
      toast.success(`Renamed to “${result.data.document.title}”.`);
      if (activeFolderId) await loadDocuments(activeFolderId);
    } catch {
      setError("Unable to rename document.");
      toast.error("Unable to rename document.");
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
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(documentId);
        return next;
      });
      if (activeFolderId) {
        await loadDocuments(activeFolderId);
        await loadFolders();
      }
    } catch {
      setError("Delete failed.");
      toast.error("Delete failed.");
    }
  }

  async function onDownloadSelected() {
    const ids = visibleDocs.filter((d) => selectedIds.has(d.id)).map((d) => d.id);
    for (const id of ids) {
      await onDownload(id);
    }
  }

  async function onDeleteSelected() {
    const targets = visibleDocs.filter((d) => selectedIds.has(d.id));
    if (targets.length === 0) return;
    if (
      !window.confirm(
        `Delete ${targets.length} selected file${targets.length === 1 ? "" : "s"}? This cannot be undone.`
      )
    ) {
      return;
    }
    setError("");
    let ok = 0;
    for (const doc of targets) {
      try {
        const result = await apiFetch<{ id: string }>(`${base}/documents/${doc.id}`, {
          method: "DELETE",
          token: getToken(),
        });
        if (result.success) ok += 1;
      } catch {
        /* continue */
      }
    }
    if (ok > 0) {
      toast.success(ok === 1 ? "Deleted 1 file" : `Deleted ${ok} files`);
      setSelectedIds(new Set());
      if (activeFolderId) {
        await loadDocuments(activeFolderId);
        await loadFolders();
      }
    } else {
      toast.error("Delete failed.");
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        visibleDocs.forEach((d) => next.delete(d.id));
        return next;
      }
      const next = new Set(prev);
      visibleDocs.forEach((d) => next.add(d.id));
      return next;
    });
  };

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

  const selectedCount = visibleDocs.filter((d) => selectedIds.has(d.id)).length;

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
        <ul className="folder-list dmhr-scroll">
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
              {visibleDocs.length !== documents.length
                ? ` · showing ${visibleDocs.length}`
                : ""}
              {documents.length > 0
                ? ` · ${formatBytes(
                    documents.reduce((sum, d) => sum + (d.latestVersion?.sizeBytes || 0), 0)
                  )} total`
                : ""}
            </p>
          </div>
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
          <PortalSelect
            className="docs-type-filter"
            size="sm"
            aria-label="Filter by file type"
            value={typeFilter}
            options={[
              { value: "all", label: "All types" },
              { value: "pdf", label: "PDF" },
            ]}
            onChange={(v) => setTypeFilter(v as DocTypeFilter)}
          />
          <PortalSelect
            className="docs-type-filter"
            size="sm"
            aria-label="Sort files"
            value={sortKey}
            options={[
              { value: "name", label: "Name" },
              { value: "date", label: "Date" },
              { value: "size", label: "Size" },
            ]}
            onChange={(v) => setSortKey(v as SortKey)}
          />
        </div>

        <DocsDropzone
          disabled={!activeFolderId}
          busy={uploading}
          accept={acceptAttr}
          hint={dropHint}
          onFiles={onUploadFiles}
        />

        {documents.length > 0 ? (
          <div className="docs-select-bar">
            <label className="docs-select-all">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAllVisible}
                aria-label="Select all visible files"
              />
              <span>
                {selectedCount}/{visibleDocs.length} selected
              </span>
            </label>
            <div className="docs-select-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={selectedCount === 0}
                onClick={onDownloadSelected}
              >
                <Download size={14} strokeWidth={1.75} aria-hidden />
                Download selected
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm docs-btn-danger"
                disabled={selectedCount === 0}
                onClick={onDeleteSelected}
              >
                <Trash2 size={14} strokeWidth={1.75} aria-hidden />
                Remove selected
              </button>
            </div>
          </div>
        ) : null}

        {error ? <div className="error-banner">{error}</div> : null}

        <div className="docs-files-body dmhr-scroll">
          {documents.length === 0 ? (
            <div className="empty-state docs-empty">
              <p>No files in this folder yet</p>
              <p className="lead">Drop files above or use Select files.</p>
            </div>
          ) : visibleDocs.length === 0 ? (
            <div className="empty-state docs-empty">
              <p>No matches</p>
              <p className="lead">Try a different search or type filter.</p>
            </div>
          ) : (
            <ul className="file-list docs-file-list">
              {visibleDocs.map((doc) => {
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
                    <label className="docs-row-check">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(doc.id)}
                        onChange={() => toggleSelect(doc.id)}
                        aria-label={`Select ${doc.title}`}
                      />
                    </label>
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
                      <IconButton
                        label="Preview"
                        aria-label={`Preview ${doc.title}`}
                        onClick={() =>
                          openPreview(doc.title, doc.id, fileName, mime)
                        }
                      >
                        <Eye size={15} strokeWidth={1.75} />
                      </IconButton>
                      <IconButton
                        label="Download"
                        aria-label={`Download ${doc.title}`}
                        onClick={() => onDownload(doc.id)}
                      >
                        <Download size={15} strokeWidth={1.75} />
                      </IconButton>
                      {!isSignedCopy ? (
                        <IconButton
                          label="Rename"
                          aria-label={`Rename ${doc.title}`}
                          onClick={() => onRename(doc.id, doc.title)}
                        >
                          <Pencil size={15} strokeWidth={1.75} />
                        </IconButton>
                      ) : null}
                      {canEsign && onRequestSignature ? (
                        <IconButton
                          label="Request signature"
                          aria-label={`Request signature for ${doc.title}`}
                          onClick={() =>
                            onRequestSignature(doc.id, doc.title, mime)
                          }
                        >
                          <FileSignature size={15} strokeWidth={1.75} />
                        </IconButton>
                      ) : null}
                      <IconButton
                        label="Delete"
                        danger
                        aria-label={`Delete ${doc.title}`}
                        onClick={() => onDelete(doc.id, doc.title)}
                      >
                        <Trash2 size={15} strokeWidth={1.75} />
                      </IconButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
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
