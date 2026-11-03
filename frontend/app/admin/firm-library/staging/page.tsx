"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  Eye,
  FolderPlus,
  Pencil,
  Send,
  Trash2,
} from "lucide-react";
import { AppShell } from "../../../../components/AppShell";
import { DocsDropzone } from "../../../../components/DocsDropzone";
import { DocsRenameDialog } from "../../../../components/DocsRenameDialog";
import { FilePreviewSheet, type FilePreviewTarget } from "../../../../components/FilePreviewSheet";
import { FirmStagingFolderTile } from "../../../../components/firm-staging/FirmStagingFolderTile";
import { FirmStagingNewFolderDialog } from "../../../../components/firm-staging/FirmStagingNewFolderDialog";
import { FirmStagingSendDialog } from "../../../../components/firm-staging/FirmStagingSendDialog";
import { IconButton } from "../../../../components/IconButton";
import { ListSkeleton, PanelSkeleton } from "../../../../components/Skeleton";
import { useConfirm } from "../../../../context/ConfirmContext";
import { useToast } from "../../../../context/ToastContext";
import {
  API_URL,
  apiFetch,
  apiUpload,
  type PublicUser,
} from "../../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../../lib/auth";
import { fetchAuthenticatedDownload } from "../../../../lib/download-file";
import {
  formatStagingBytes,
  isSystemStagingFolderKey,
  type FirmStagingClientFolderKey,
  type FirmStagingFile,
  type FirmStagingFolder,
} from "../../../../lib/firm-staging";
import { adminNav } from "../../../../lib/nav";
import { isPdfDocument } from "../../../../lib/signatures";

type OrgOption = { id: string; name: string; status?: string };

type StagingPayload = {
  folders: FirmStagingFolder[];
  folderId: string | null;
  files: FirmStagingFile[];
};

export default function AdminFirmLibraryStagingPage() {
  const router = useRouter();
  const { confirm } = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [folders, setFolders] = useState<FirmStagingFolder[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [files, setFiles] = useState<FirmStagingFile[]>([]);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<FilePreviewTarget | null>(null);
  const [sendFiles, setSendFiles] = useState<FirmStagingFile[]>([]);
  const [renameFile, setRenameFile] = useState<FirmStagingFile | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);

  const token = useMemo(() => getToken(), []);
  const activeFolder = folders.find((f) => f.id === folderId) || null;
  const sendDefaultFolderKey =
    activeFolder && isSystemStagingFolderKey(activeFolder.key)
      ? activeFolder.key
      : "my_documents";

  const selectedCount = files.filter((f) => selectedIds.has(f.id)).length;
  const allSelected = files.length > 0 && files.every((f) => selectedIds.has(f.id));
  const selectedFiles = files.filter((f) => selectedIds.has(f.id));

  const load = useCallback(
    async (nextFolderId?: string | null) => {
      setLoading(true);
      const targetId =
        nextFolderId === null
          ? undefined
          : nextFolderId !== undefined
            ? nextFolderId
            : folderId || undefined;
      const q = targetId ? `?folderId=${encodeURIComponent(targetId)}` : "";
      const result = await apiFetch<StagingPayload>(`/admin/firm-staging${q}`, { token });
      if (result.success) {
        setFolders(result.data.folders);
        setFolderId(result.data.folderId);
        setFiles(result.data.files);
        setSelectedIds(new Set());
      } else {
        toastError(result.error.message);
      }
      setLoading(false);
    },
    [folderId, token, toastError]
  );

  useEffect(() => {
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "admin") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
    void (async () => {
      const [staging, orgRes] = await Promise.all([
        apiFetch<StagingPayload>("/admin/firm-staging", { token }),
        apiFetch<{ organisations: OrgOption[] }>("/admin/organisations", { token }),
      ]);
      if (staging.success) {
        setFolders(staging.data.folders);
        setFolderId(staging.data.folderId);
        setFiles(staging.data.files);
      } else {
        toastError(staging.error.message);
      }
      if (orgRes.success) {
        setOrgs(
          orgRes.data.organisations
            .filter((o) => String(o.status || "active").toLowerCase() === "active")
            .map((o) => ({ id: o.id, name: o.name, status: o.status }))
        );
      }
      setLoading(false);
    })();
  }, [router, token, toastError]);

  const onSelectFolder = (id: string) => {
    setFolderId(id);
    setSelectedIds(new Set());
    void load(id);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(files.map((f) => f.id)));
  };

  const onUpload = async (picked: File[]) => {
    if (!folderId || !token || picked.length === 0) return;
    setUploading(true);
    let okCount = 0;
    const failures: string[] = [];

    for (const file of picked) {
      if (!isPdfDocument(file.type, file.name)) {
        failures.push(`${file.name}: PDF only`);
        continue;
      }
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folderId", folderId);
      const result = await apiUpload<{ file: FirmStagingFile }>(
        "/admin/firm-staging/files",
        fd,
        token
      );
      if (result.success) okCount += 1;
      else failures.push(`${file.name}: ${result.error.message}`);
    }

    setUploading(false);
    if (okCount > 0) {
      toastSuccess(okCount === 1 ? "Added 1 file" : `Added ${okCount} files`);
      await load(folderId);
    }
    if (failures.length > 0) {
      toastError(failures.slice(0, 3).join(" · "));
    }
  };

  const onRenameSave = async (title: string) => {
    if (!renameFile) return;
    const next = title.trim();
    if (!next || next === renameFile.title) {
      setRenameFile(null);
      return;
    }
    setRenaming(true);
    const result = await apiFetch<{ file: FirmStagingFile }>(
      `/admin/firm-staging/files/${renameFile.id}`,
      {
        method: "PATCH",
        token,
        body: JSON.stringify({ title: next }),
      }
    );
    setRenaming(false);
    if (result.success) {
      toastSuccess("File renamed");
      setRenameFile(null);
      await load(folderId);
    } else {
      toastError(result.error.message);
    }
  };

  const deleteOne = async (file: FirmStagingFile): Promise<boolean> => {
    const result = await apiFetch<{ ok: boolean }>(`/admin/firm-staging/files/${file.id}`, {
      method: "DELETE",
      token,
    });
    if (!result.success) {
      toastError(result.error.message);
      return false;
    }
    return true;
  };

  const onDelete = async (file: FirmStagingFile) => {
    const ok = await confirm({
      title: "Delete staging file?",
      description: `Remove “${file.title}” from Firm staging? This does not delete copies already sent to clients.`,
      tone: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    if (await deleteOne(file)) {
      toastSuccess("File deleted");
      await load(folderId);
    }
  };

  const onDeleteSelected = async () => {
    if (selectedFiles.length === 0) return;
    const ok = await confirm({
      title: "Delete selected files?",
      description: `Remove ${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} from Firm staging? Client copies already sent are kept.`,
      tone: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    let deleted = 0;
    for (const file of selectedFiles) {
      if (await deleteOne(file)) deleted += 1;
    }
    if (deleted > 0) {
      toastSuccess(deleted === 1 ? "Deleted 1 file" : `Deleted ${deleted} files`);
      await load(folderId);
    }
  };

  const fileUrl = (id: string) => `${API_URL}/admin/firm-staging/files/${id}/file`;

  const onPreview = (file: FirmStagingFile) => {
    setPreview({
      title: file.title,
      url: fileUrl(file.id),
      fileName: file.fileName,
      mimeType: file.mimeType,
    });
  };

  const onDownload = async (file: FirmStagingFile) => {
    try {
      await fetchAuthenticatedDownload(fileUrl(file.id), file.fileName, getToken());
    } catch {
      toastError("Download failed");
    }
  };

  const onDownloadSelected = async () => {
    if (selectedFiles.length === 0) return;
    if (selectedFiles.length > 1) {
      toastSuccess(`Downloading ${selectedFiles.length} files…`);
    }
    let failed = 0;
    for (let i = 0; i < selectedFiles.length; i += 1) {
      const file = selectedFiles[i];
      try {
        await fetchAuthenticatedDownload(fileUrl(file.id), file.fileName, getToken());
        // Brief gap so browsers don't treat rapid blob saves as pop-ups.
        if (i < selectedFiles.length - 1) {
          await new Promise((r) => window.setTimeout(r, 350));
        }
      } catch {
        failed += 1;
      }
    }
    if (failed > 0) {
      toastError(
        `${failed} of ${selectedFiles.length} download${selectedFiles.length === 1 ? "" : "s"} failed`
      );
    } else if (selectedFiles.length > 1) {
      toastSuccess(`Downloaded ${selectedFiles.length} files`);
    }
  };

  const onCreateFolder = async (name: string) => {
    setCreatingFolder(true);
    const result = await apiFetch<{ folder: FirmStagingFolder }>("/admin/firm-staging/folders", {
      method: "POST",
      token,
      body: JSON.stringify({ name }),
    });
    setCreatingFolder(false);
    if (result.success) {
      toastSuccess(result.message || "Folder created");
      setNewFolderOpen(false);
      await load(result.data.folder.id);
    } else {
      toastError(result.error.message);
    }
  };

  const onDeleteFolder = async () => {
    if (!activeFolder || activeFolder.isSystem !== false) return;
    const ok = await confirm({
      title: "Delete vault folder?",
      description: `Remove “${activeFolder.name}”? Only empty custom folders can be deleted.`,
      tone: "danger",
      confirmLabel: "Delete folder",
    });
    if (!ok) return;
    const result = await apiFetch<{ ok: boolean }>(
      `/admin/firm-staging/folders/${activeFolder.id}`,
      { method: "DELETE", token }
    );
    if (result.success) {
      toastSuccess("Folder deleted");
      await load(null);
    } else {
      toastError(result.error.message);
    }
  };

  const onSend = async (payload: {
    organisationId: string;
    folderKey: FirmStagingClientFolderKey;
  }) => {
    if (sendFiles.length === 0) return;
    setSending(true);
    const result = await apiFetch<{
      copied: number;
      failed: number;
      organisation: { id: string; name: string } | null;
      folder: { id: string; key: string; name: string } | null;
    }>("/admin/firm-staging/copy-to-client", {
      method: "POST",
      token,
      body: JSON.stringify({
        ...payload,
        fileIds: sendFiles.map((f) => f.id),
      }),
    });
    setSending(false);
    if (result.success) {
      toastSuccess(result.message || "Copied to client");
      setSendFiles([]);
      setSelectedIds(new Set());
    } else {
      toastError(result.error.message);
    }
  };

  if (!user) return null;

  return (
    <AppShell user={user} nav={adminNav} title="Firm staging">
      <div className="profile-hub-head" style={{ marginBottom: 16 }}>
        <div className="profile-hub-head-main">
          <IconButton
            href="/admin/firm-library"
            label="Back"
            aria-label="Back to Firm Library"
            side="bottom"
          >
            <ArrowLeft size={16} strokeWidth={1.75} />
          </IconButton>
          <div className="profile-hub-titles">
            <h1>Firm staging</h1>
            <div className="profile-hub-meta">
              Firm vault · copy into client Documents · not Private Space or Onboarding pack
            </div>
          </div>
        </div>
      </div>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="firm-staging-head">
          <div>
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Vault folders</h2>
            <p className="org-meta" style={{ margin: "4px 0 0" }}>
              Six client mirrors plus your own vault folders.{" "}
              <Link href="/admin/firm-library/onboarding">Onboarding pack</Link> stays separate.
            </p>
          </div>
          <div className="firm-staging-head-actions">
            {activeFolder && activeFolder.isSystem === false ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm docs-btn-danger"
                onClick={() => void onDeleteFolder()}
              >
                <Trash2 size={14} strokeWidth={1.75} aria-hidden />
                Delete folder
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setNewFolderOpen(true)}
            >
              <FolderPlus size={14} strokeWidth={1.75} aria-hidden />
              New folder
            </button>
          </div>
        </div>
        {loading && folders.length === 0 ? (
          <PanelSkeleton lines={3} />
        ) : (
          <div className="firm-staging-tiles-scroll dmhr-scroll" role="presentation">
            <div className="firm-staging-tiles" role="listbox" aria-label="Firm staging folders">
              {folders.map((folder) => (
                <FirmStagingFolderTile
                  key={folder.id}
                  folder={folder}
                  selected={folder.id === folderId}
                  onSelect={onSelectFolder}
                />
              ))}
              <button
                type="button"
                className="firm-staging-tile firm-staging-tile-add"
                onClick={() => setNewFolderOpen(true)}
                aria-label="New vault folder"
              >
                <span className="firm-staging-add-mark" aria-hidden>
                  <FolderPlus size={22} strokeWidth={1.75} />
                </span>
                <strong className="firm-staging-tile-name">New folder</strong>
                <span className="firm-staging-tile-meta">Custom vault</span>
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="firm-staging-files-head">
          <div>
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>
              {activeFolder ? activeFolder.name : "Files"}
            </h2>
            <p className="org-meta" style={{ margin: "4px 0 0" }}>
              Upload PDFs here, then send copies into any client&apos;s Documents folder.
            </p>
          </div>
        </div>

        <DocsDropzone
          accept=".pdf,application/pdf"
          hint="PDF only · multi-select · drag and drop or select"
          title="Drop PDFs into this vault folder"
          selectLabel="Select files"
          multiple
          busy={uploading}
          disabled={!folderId || uploading}
          onFiles={onUpload}
          compact
        />

        {files.length > 0 ? (
          <div className="docs-select-bar" style={{ marginTop: 12 }}>
            <label className="docs-select-all">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                aria-label="Select all files in this folder"
              />
              <span>
                {selectedCount}/{files.length} selected
              </span>
            </label>
            <div className="docs-select-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={selectedCount === 0}
                onClick={() => void onDownloadSelected()}
              >
                <Download size={14} strokeWidth={1.75} aria-hidden />
                Download selected
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={selectedCount === 0}
                onClick={() => setSendFiles(selectedFiles)}
              >
                <Send size={14} strokeWidth={1.75} aria-hidden />
                Send selected
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm docs-btn-danger"
                disabled={selectedCount === 0}
                onClick={() => void onDeleteSelected()}
              >
                <Trash2 size={14} strokeWidth={1.75} aria-hidden />
                Remove selected
              </button>
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: files.length > 0 ? 6 : 14 }}>
          {loading ? (
            <ListSkeleton rows={4} />
          ) : files.length === 0 ? (
            <div className="docs-empty empty-state">
              <p>No files in this folder yet.</p>
              <p className="lead">Drop PDFs above or use Select files.</p>
            </div>
          ) : (
            <ul className="firm-staging-file-list">
              {files.map((file) => (
                <li key={file.id} className="firm-staging-file-row">
                  <label className="docs-row-check">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(file.id)}
                      onChange={() => toggleSelect(file.id)}
                      aria-label={`Select ${file.title}`}
                    />
                  </label>
                  <div className="firm-staging-file-main">
                    <strong>{file.title}</strong>
                    <span className="org-meta">
                      {file.fileName} · {formatStagingBytes(file.sizeBytes)}
                    </span>
                  </div>
                  <div className="firm-staging-file-actions">
                    <IconButton
                      label="Preview"
                      aria-label={`Preview ${file.title}`}
                      side="bottom"
                      onClick={() => onPreview(file)}
                    >
                      <Eye size={15} strokeWidth={1.75} />
                    </IconButton>
                    <IconButton
                      label="Download"
                      aria-label={`Download ${file.title}`}
                      side="bottom"
                      onClick={() => void onDownload(file)}
                    >
                      <Download size={15} strokeWidth={1.75} />
                    </IconButton>
                    <IconButton
                      label="Rename"
                      aria-label={`Rename ${file.title}`}
                      side="bottom"
                      onClick={() => setRenameFile(file)}
                    >
                      <Pencil size={15} strokeWidth={1.75} />
                    </IconButton>
                    <IconButton
                      label="Send to client"
                      aria-label={`Send ${file.title} to client`}
                      side="bottom"
                      onClick={() => setSendFiles([file])}
                    >
                      <Send size={15} strokeWidth={1.75} />
                    </IconButton>
                    <IconButton
                      label="Delete"
                      aria-label={`Delete ${file.title}`}
                      side="bottom"
                      danger
                      onClick={() => void onDelete(file)}
                    >
                      <Trash2 size={15} strokeWidth={1.75} />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <FirmStagingSendDialog
        open={sendFiles.length > 0}
        files={sendFiles}
        organisations={orgs}
        defaultFolderKey={sendDefaultFolderKey}
        busy={sending}
        onClose={() => {
          if (!sending) setSendFiles([]);
        }}
        onSubmit={onSend}
      />

      <FirmStagingNewFolderDialog
        open={newFolderOpen}
        busy={creatingFolder}
        onClose={() => {
          if (!creatingFolder) setNewFolderOpen(false);
        }}
        onCreate={onCreateFolder}
      />

      <DocsRenameDialog
        open={Boolean(renameFile)}
        currentTitle={renameFile?.title || ""}
        busy={renaming}
        onClose={() => {
          if (!renaming) setRenameFile(null);
        }}
        onSave={onRenameSave}
      />

      <FilePreviewSheet target={preview} onClose={() => setPreview(null)} />
    </AppShell>
  );
}
