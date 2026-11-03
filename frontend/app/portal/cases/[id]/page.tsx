"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Download, Eye, Pencil, Trash2 } from "lucide-react";
import { AppShell } from "../../../../components/AppShell";
import { CaseFormDialog } from "../../../../components/CaseFormDialog";
import { CaseTimeline } from "../../../../components/CaseTimeline";
import { DocsDropzone } from "../../../../components/DocsDropzone";
import { FilePreviewSheet, type FilePreviewTarget } from "../../../../components/FilePreviewSheet";
import { IconButton } from "../../../../components/IconButton";
import { PanelSkeleton } from "../../../../components/Skeleton";
import { useConfirm } from "../../../../context/ConfirmContext";
import { useToast } from "../../../../context/ToastContext";
import { API_URL, apiFetch, authHeaders, type PublicUser } from "../../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../../lib/auth";
import { triggerBlobDownload } from "../../../../lib/download-file";
import {
  caseBadgeTone,
  categoryDisplayName,
  formatCaseDate,
  hasCaseField,
  statusLabel,
  type CaseCategory,
  type CaseRow,
} from "../../../../lib/cases";
import { clientNav } from "../../../../lib/nav";

function ClientCaseDetailInner() {
  const params = useParams();
  const id = String(params.id || "");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { error: toastError, success: toastSuccess } = useToast();
  const { confirm } = useConfirm();

  const [user, setUser] = useState<PublicUser | null>(null);
  const [c, setCase] = useState<CaseRow | null>(null);
  const [categories, setCategories] = useState<CaseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editUrlConsumed, setEditUrlConsumed] = useState(false);
  const [preview, setPreview] = useState<FilePreviewTarget | null>(null);
  const [busyFile, setBusyFile] = useState(false);

  const clearEditQuery = useCallback(() => {
    if (searchParams.get("edit") !== "1") return;
    router.replace(`/portal/cases/${id}`);
  }, [id, router, searchParams]);

  const closeEdit = useCallback(() => {
    setEditOpen(false);
    clearEditQuery();
  }, [clearEditQuery]);

  const load = useCallback(async () => {
    if (!id) return;
    const result = await apiFetch<{ case: CaseRow }>(`/client/cases/${id}`, {
      token: getToken(),
    });
    if (result.success) {
      setCase(result.data.case);
    } else {
      toastError(result.error.message);
      setCase(null);
    }
    setLoading(false);
  }, [id, toastError]);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "client") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
    (async () => {
      const cats = await apiFetch<{ categories: CaseCategory[] }>(
        "/client/case-categories",
        { token }
      );
      if (cats.success) setCategories(cats.data.categories);
    })();
    load();
  }, [router, load]);

  useEffect(() => {
    setEditUrlConsumed(false);
  }, [id]);

  useEffect(() => {
    if (!c || loading || editUrlConsumed) return;
    if (searchParams.get("edit") === "1") {
      setEditOpen(true);
      setEditUrlConsumed(true);
    }
  }, [c, loading, searchParams, editUrlConsumed]);

  async function onMessage(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setPosting(true);
    try {
      const form = new FormData();
      form.append("body", body.trim());
      files.forEach((f) => form.append("files", f));
      const res = await fetch(`${API_URL}/client/cases/${id}/messages`, {
        method: "POST",
        headers: authHeaders(getToken()),
        body: form,
      });
      const json = await res.json();
      if (!json.success) {
        toastError(json.error?.message || "Failed to post");
        return;
      }
      setCase(json.data.case);
      setBody("");
      setFiles([]);
      toastSuccess("Reply posted");
    } catch {
      toastError("Failed to post");
    } finally {
      setPosting(false);
    }
  }

  async function download(attId: string, fileName: string) {
    try {
      const res = await fetch(`${API_URL}/client/case-attachments/${attId}/download`, {
        headers: authHeaders(getToken()),
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      triggerBlobDownload(blob, fileName);
    } catch {
      toastError("Download failed");
    }
  }

  async function onDeleteAttachment(attId: string, fileName: string) {
    const ok = await confirm({
      title: "Remove file?",
      description: `Remove “${fileName}” from this case?`,
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    setBusyFile(true);
    const result = await apiFetch<{ id: string }>(`/client/case-attachments/${attId}`, {
      method: "DELETE",
      token: getToken(),
    });
    setBusyFile(false);
    if (!result.success) {
      toastError(result.error.message);
      return;
    }
    setCase((prev) =>
      prev
        ? {
            ...prev,
            attachments: (prev.attachments || []).filter((x) => x.id !== attId),
          }
        : prev
    );
    toastSuccess("File removed");
  }

  if (!user) return null;

  const messages = c?.messages || [];
  const attachments = c?.attachments || [];

  return (
    <AppShell user={user} nav={clientNav} title={c ? c.ref : "Case"}>
      {loading ? (
        <div className="panel">
          <PanelSkeleton lines={8} />
        </div>
      ) : null}

      {!loading && !c ? (
        <div className="empty-state">
          <p>Case not found.</p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => router.push("/portal/cases")}
          >
            Back to cases
          </button>
        </div>
      ) : null}

      {c && !loading ? (
        <>
          <div className="profile-hub-head">
            <div className="profile-hub-head-main">
              <IconButton
                href="/portal/cases"
                label="Back"
                aria-label="Back to cases"
                side="bottom"
              >
                <ArrowLeft size={16} strokeWidth={1.75} />
              </IconButton>
              <div className="profile-hub-titles">
                <h1>{c.title}</h1>
                <div className="profile-hub-meta">
                  <span className="case-hub-ref">{c.ref}</span>
                  <span aria-hidden>·</span>
                  {categoryDisplayName(c.category, c.categoryOther)}
                  <span className={`status-pill status-pill-${caseBadgeTone(c.status)}`}>
                    {statusLabel(c.status)}
                  </span>
                </div>
              </div>
            </div>
            <div className="profile-hub-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setEditOpen(true)}
              >
                <Pencil size={14} strokeWidth={1.75} aria-hidden />
                Edit details
              </button>
            </div>
          </div>

          <div className="case-hub-layout case-hub-layout-client">
            <div className="case-hub-main">
              <section className="panel case-hub-panel case-hub-panel--overview">
                <div className="case-hub-panel-head">
                  <h2>Case overview</h2>
                  <p className="lead">
                    Submitted {formatCaseDate(c.createdAt)} · Updated{" "}
                    {formatCaseDate(c.updatedAt)}
                  </p>
                </div>

                <div className="case-hub-panel-scroll">
                  <div className="case-overview-grid">
                    <div>
                      <span className="profile-meta-label">Category</span>
                      <span className="profile-meta-value">
                        {categoryDisplayName(c.category, c.categoryOther)}
                      </span>
                    </div>
                    <div>
                      <span className="profile-meta-label">Related employee</span>
                      <span className="profile-meta-value">
                        {c.employee?.name || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="profile-meta-label">Status</span>
                      <span className={`status-pill status-pill-${caseBadgeTone(c.status)}`}>
                        {statusLabel(c.status)}
                      </span>
                    </div>
                  </div>

                  <div className="case-overview-block">
                    <h3>Issue / supporting information</h3>
                    <p className="case-overview-text">{c.description}</p>
                  </div>

                  {(
                    [
                      ["People involved / witnesses", c.peopleInvolved],
                      ["Investigation", c.investigation],
                      ["Outcome", c.outcome],
                    ] as const
                  ).map(([label, value]) =>
                    hasCaseField(value) ? (
                      <div key={label} className="case-overview-block">
                        <h3>{label}</h3>
                        <p className="case-overview-text">{value}</p>
                      </div>
                    ) : (
                      <div key={label} className="case-overview-row is-empty">
                        <span className="case-overview-row-label">{label}</span>
                        <span className="case-overview-empty">Not recorded yet</span>
                      </div>
                    )
                  )}
                </div>
              </section>

              <section className="panel case-hub-panel case-hub-panel--files">
                <div className="case-hub-panel-head">
                  <h2>Files</h2>
                </div>
                <div className="case-hub-panel-scroll">
                  {attachments.length === 0 ? (
                    <p className="lead" style={{ margin: 0, fontSize: "0.85rem" }}>
                      No attachments yet.
                    </p>
                  ) : (
                    <ul className="case-file-list">
                      {attachments.map((a) => (
                        <li key={a.id} className="case-file-row">
                          <div className="case-file-main">
                            <span className="case-file-chip">File</span>
                            <span className="case-file-name">{a.fileName}</span>
                          </div>
                          <div className="case-file-actions">
                            <IconButton
                              label={`Preview ${a.fileName}`}
                              onClick={() =>
                                setPreview({
                                  title: a.fileName,
                                  url: `${API_URL}/client/case-attachments/${a.id}/download`,
                                  fileName: a.fileName,
                                  mimeType: a.mimeType,
                                })
                              }
                            >
                              <Eye size={16} strokeWidth={1.75} />
                            </IconButton>
                            <IconButton
                              label={`Download ${a.fileName}`}
                              onClick={() => download(a.id, a.fileName)}
                            >
                              <Download size={16} strokeWidth={1.75} />
                            </IconButton>
                            {(a.uploadedById || a.uploadedBy?.id) === user.id ? (
                              <IconButton
                                label={`Remove ${a.fileName}`}
                                danger
                                disabled={busyFile}
                                onClick={() => onDeleteAttachment(a.id, a.fileName)}
                              >
                                <Trash2 size={16} strokeWidth={1.75} />
                              </IconButton>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              <CaseTimeline messages={messages} role="client" />

              <section className="panel case-hub-panel case-composer">
                <form onSubmit={onMessage} className="form-compact">
                  <h3>Reply</h3>
                  <div className="field">
                    <label htmlFor="case-msg">Message</label>
                    <textarea
                      id="case-msg"
                      rows={3}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      required
                      placeholder="Write a reply to DM.HR Group…"
                    />
                  </div>
                  <div className="field">
                    <label>Attachments (optional)</label>
                    <DocsDropzone
                      compact
                      accept=".pdf,application/pdf"
                      hint="PDF only · drag and drop or select"
                      title="Drop files to attach"
                      onFiles={(picked) =>
                        setFiles((prev) => {
                          const names = new Set(prev.map((f) => `${f.name}:${f.size}`));
                          return [
                            ...prev,
                            ...picked.filter((f) => !names.has(`${f.name}:${f.size}`)),
                          ];
                        })
                      }
                    />
                    {files.length > 0 ? (
                      <ul className="docs-file-chips">
                        {files.map((f) => (
                          <li key={`${f.name}-${f.size}`} className="docs-file-chip-item">
                            <span>{f.name}</span>
                            <button
                              type="button"
                              className="docs-file-chip-remove"
                              aria-label={`Remove ${f.name}`}
                              onClick={() =>
                                setFiles((prev) =>
                                  prev.filter(
                                    (x) => !(x.name === f.name && x.size === f.size)
                                  )
                                )
                              }
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={posting || !body.trim()}
                  >
                    {posting ? "Posting…" : "Post reply"}
                  </button>
                </form>
              </section>
            </div>
          </div>

          <CaseFormDialog
            open={editOpen}
            mode="edit"
            role="client"
            categories={categories}
            caseRow={c}
            onClose={closeEdit}
            onSaved={(updated) => {
              setCase(updated);
              closeEdit();
              void load();
            }}
          />

          <FilePreviewSheet target={preview} onClose={() => setPreview(null)} />
        </>
      ) : null}
    </AppShell>
  );
}

export default function ClientCaseDetailPage() {
  return (
    <Suspense
      fallback={
        <main className="auth-shell">
          <p className="lead">Loading case…</p>
        </main>
      }
    >
      <ClientCaseDetailInner />
    </Suspense>
  );
}
