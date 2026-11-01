"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye } from "lucide-react";
import {
  API_URL,
  apiDownload,
  apiFetch,
  apiUpload,
  type DocumentRow,
  type FolderRow,
} from "../lib/api";
import { getToken } from "../lib/auth";
import { isPdfDocument } from "../lib/signatures";
import { FilePreviewSheet, type FilePreviewTarget } from "./FilePreviewSheet";

type DocumentsPanelProps = {
  mode: "client" | "admin";
  organisationId?: string;
  organisationName?: string;
  /** Prefer selecting this folder key on load (e.g. my_onboarding). */
  preferredFolderKey?: string | null;
  onRequestSignature?: (documentId: string, title: string, mimeType: string | null) => void;
};

type VersionRow = {
  id: string;
  versionNumber: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsPanel({
  mode,
  organisationId,
  organisationName,
  preferredFolderKey,
  onRequestSignature,
}: DocumentsPanelProps) {
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [folderName, setFolderName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<FilePreviewTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [versionsFor, setVersionsFor] = useState<{
    title: string;
    documentId: string;
    versions: VersionRow[];
  } | null>(null);

  const base =
    mode === "client"
      ? "/client"
      : `/admin/organisations/${organisationId}`;

  const resetDocArea = useCallback(() => {
    setFolders([]);
    setActiveFolderId(null);
    setDocuments([]);
    setFolderName("");
    setVersionsFor(null);
    setError("");
    setNotice("");
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
      // Keep folder only if it belongs to this org's folder list; else preferred key; else first
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
          setVersionsFor(null);
          setError(result.error.message);
          return;
        }
        setFolderName(result.data.folder.name);
        setDocuments(result.data.documents);
      } catch {
        setDocuments([]);
        setFolderName("");
        setVersionsFor(null);
        setError("Unable to load documents.");
      }
    },
    [base]
  );

  // Admin org switch — clear stale folders/files before refetch
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
    } else {
      setDocuments([]);
      setFolderName("");
      setVersionsFor(null);
    }
  }, [activeFolderId, loadDocuments]);

  async function onUpload(file: File | null) {
    if (!file || !activeFolderId) return;
    setUploading(true);
    setError("");
    setNotice("");
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
        return;
      }
      setNotice(`Uploaded ${result.data.document.title}`);
      await loadDocuments(activeFolderId);
      await loadFolders();
    } catch {
      setError("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function onDownload(documentId: string, version?: number) {
    setError("");
    try {
      const q = version ? `?version=${version}` : "";
      const { blob, fileName } = await apiDownload(
        `${base}/documents/${documentId}/download${q}`,
        getToken()
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    }
  }

  async function onDelete(documentId: string, title: string) {
    if (!window.confirm(`Delete “${title}” and all versions? This cannot be undone.`)) return;
    setError("");
    setNotice("");
    try {
      const result = await apiFetch<{ id: string }>(`${base}/documents/${documentId}`, {
        method: "DELETE",
        token: getToken(),
      });
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setNotice(`Deleted ${title}`);
      setVersionsFor(null);
      if (activeFolderId) {
        await loadDocuments(activeFolderId);
        await loadFolders();
      }
    } catch {
      setError("Delete failed.");
    }
  }

  async function openVersions(doc: DocumentRow) {
    setError("");
    try {
      const result = await apiFetch<{
        document: { id: string; title: string };
        versions: VersionRow[];
      }>(`${base}/documents/${doc.id}/versions`, { token: getToken() });
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setVersionsFor({
        documentId: result.data.document.id,
        title: result.data.document.title,
        versions: result.data.versions,
      });
    } catch {
      setError("Unable to load versions.");
    }
  }

  if (mode === "admin" && !organisationId) {
    return (
      <section className="panel">
        <h2>Documents</h2>
        <p className="lead">Select an organisation to browse its folders.</p>
      </section>
    );
  }

  return (
    <div className="docs-layout">
      <aside className="docs-folders panel">
        <h2>Folders</h2>
        {organisationName ? <p className="lead">{organisationName}</p> : null}
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
          <div>
            <h2>{folderName || "Documents"}</h2>
            <p className="lead">Word and PDF by default. Versions are kept until deleted.</p>
          </div>
          <label className={`btn btn-primary btn-sm upload-btn${uploading ? " disabled" : ""}`}>
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

        {error ? <div className="error-banner">{error}</div> : null}
        {notice ? <div className="success-banner">{notice}</div> : null}

        {documents.length === 0 ? (
          <div className="empty-state">
            <p>No files in this folder yet.</p>
            <p className="lead">Upload a PDF or Word document to get started.</p>
          </div>
        ) : (
          <ul className="file-list">
            {documents.map((doc) => (
              <li key={doc.id}>
                <div>
                  <div className="file-title">{doc.title}</div>
                  <div className="file-meta">
                    v{doc.currentVersion}
                    {doc.latestVersion
                      ? ` · ${doc.latestVersion.fileName} · ${formatBytes(doc.latestVersion.sizeBytes)}`
                      : ""}
                  </div>
                </div>
                <div className="file-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    title="Preview"
                    aria-label={`Preview ${doc.title}`}
                    onClick={() =>
                      setPreview({
                        title: doc.title,
                        url: `${API_URL}${base}/documents/${doc.id}/download`,
                        fileName: doc.latestVersion?.fileName || doc.title,
                        mimeType: doc.latestVersion?.mimeType || null,
                      })
                    }
                  >
                    <Eye size={15} strokeWidth={1.75} aria-hidden />
                    Preview
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDownload(doc.id)}>
                    Download
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => openVersions(doc)}>
                    Versions
                  </button>
                  {mode === "admin" &&
                  onRequestSignature &&
                  isPdfDocument(
                    doc.latestVersion?.mimeType,
                    doc.latestVersion?.fileName || doc.title
                  ) ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        onRequestSignature(
                          doc.id,
                          doc.title,
                          doc.latestVersion?.mimeType || null
                        )
                      }
                    >
                      Request signature
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm danger"
                    onClick={() => onDelete(doc.id, doc.title)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {versionsFor ? (
          <div className="versions-panel">
            <div className="docs-files-head">
              <h3>Versions — {versionsFor.title}</h3>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setVersionsFor(null)}>
                Close
              </button>
            </div>
            <ul className="file-list">
              {versionsFor.versions.map((v) => (
                <li key={v.id}>
                  <div>
                    <div className="file-title">Version {v.versionNumber}</div>
                    <div className="file-meta">
                      {v.fileName} · {formatBytes(v.sizeBytes)} ·{" "}
                      {new Date(v.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="file-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      title="Preview"
                      aria-label={`Preview version ${v.versionNumber}`}
                      onClick={() =>
                        setPreview({
                          title: `${versionsFor.title} (v${v.versionNumber})`,
                          url: `${API_URL}${base}/documents/${versionsFor.documentId}/download?version=${v.versionNumber}`,
                          fileName: v.fileName,
                          mimeType: v.mimeType,
                        })
                      }
                    >
                      <Eye size={15} strokeWidth={1.75} aria-hidden />
                      Preview
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => onDownload(versionsFor.documentId, v.versionNumber)}
                    >
                      Download
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
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
                const versionMatch = /[?&]version=(\d+)/.exec(preview.url);
                const version = versionMatch ? Number(versionMatch[1]) : undefined;
                onDownload(id, version);
              }
            : undefined
        }
      />
    </div>
  );
}
