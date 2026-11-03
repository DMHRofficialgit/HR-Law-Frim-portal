"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Briefcase,
  Download,
  Eye,
  FolderOpen,
  Trash2,
} from "lucide-react";
import { AppShell } from "../../../../components/AppShell";
import { CaseFormDialog } from "../../../../components/CaseFormDialog";
import { CaseTimeline } from "../../../../components/CaseTimeline";
import { DocsDropzone } from "../../../../components/DocsDropzone";
import { FilePreviewSheet, type FilePreviewTarget } from "../../../../components/FilePreviewSheet";
import { IconButton } from "../../../../components/IconButton";
import { PortalSelect } from "../../../../components/PortalSelect";
import { RowActionsMenu } from "../../../../components/RowActionsMenu";
import { PanelSkeleton } from "../../../../components/Skeleton";
import { useConfirm } from "../../../../context/ConfirmContext";
import { useToast } from "../../../../context/ToastContext";
import { API_URL, apiFetch, authHeaders, type PublicUser } from "../../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../../lib/auth";
import { triggerBlobDownload } from "../../../../lib/download-file";
import {
  CASE_STATUSES,
  caseBadgeTone,
  categoryDisplayName,
  formatCaseDate,
  hasCaseField,
  statusLabel,
  type CaseCategory,
  type CaseRow,
} from "../../../../lib/cases";
import { adminNav } from "../../../../lib/nav";

function AdminCaseDetailInner() {
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
  const [status, setStatus] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"client_visible" | "admin_only">(
    "client_visible"
  );
  const [files, setFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editUrlConsumed, setEditUrlConsumed] = useState(false);
  const [preview, setPreview] = useState<FilePreviewTarget | null>(null);
  const [busy, setBusy] = useState(false);

  const clearEditQuery = useCallback(() => {
    if (searchParams.get("edit") !== "1") return;
    router.replace(`/admin/cases/${id}`);
  }, [id, router, searchParams]);

  const closeEdit = useCallback(() => {
    setEditOpen(false);
    clearEditQuery();
  }, [clearEditQuery]);

  const load = useCallback(async () => {
    if (!id) return;
    const result = await apiFetch<{ case: CaseRow }>(`/admin/cases/${id}`, {
      token: getToken(),
    });
    if (result.success) {
      setCase(result.data.case);
      setStatus(result.data.case.status);
    } else {
      toastError(result.error.message);
      setCase(null);
    }
    setLoading(false);
  }, [id, toastError]);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "admin") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
    (async () => {
      const cats = await apiFetch<{ categories: CaseCategory[] }>("/admin/case-categories", {
        token,
      });
      if (cats.success) {
        setCategories(cats.data.categories.filter((x) => x.active !== false));
      }
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

  async function onStatus(e: FormEvent) {
    e.preventDefault();
    setStatusSaving(true);
    const result = await apiFetch<{ case: CaseRow }>(`/admin/cases/${id}/status`, {
      method: "PATCH",
      token: getToken(),
      body: JSON.stringify({ status }),
    });
    setStatusSaving(false);
    if (!result.success) {
      toastError(result.error.message);
      return;
    }
    setCase(result.data.case);
    setStatus(result.data.case.status);
    toastSuccess("Status updated");
  }

  async function onMessage(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setPosting(true);
    try {
      const form = new FormData();
      form.append("body", body.trim());
      form.append("visibility", visibility);
      files.forEach((f) => form.append("files", f));
      const res = await fetch(`${API_URL}/admin/cases/${id}/messages`, {
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
      toastSuccess(
        visibility === "admin_only" ? "Private note saved" : "Update published"
      );
    } catch {
      toastError("Failed to post");
    } finally {
      setPosting(false);
    }
  }

  async function download(attId: string, fileName: string) {
    try {
      const res = await fetch(`${API_URL}/admin/case-attachments/${attId}/download`, {
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
    setBusy(true);
    const result = await apiFetch<{ id: string }>(`/admin/case-attachments/${attId}`, {
      method: "DELETE",
      token: getToken(),
    });
    setBusy(false);
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

  async function onDelete() {
    if (!c) return;
    const ok = await confirm({
      title: `Delete ${c.ref}?`,
      description: "This cannot be undone.",
      confirmLabel: "Delete case",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    const result = await apiFetch<{ id: string }>(`/admin/cases/${c.id}`, {
      method: "DELETE",
      token: getToken(),
    });
    setBusy(false);
    if (!result.success) {
      toastError(result.error.message);
      return;
    }
    toastSuccess("Case deleted");
    router.replace("/admin/cases");
  }

  if (!user) return null;

  const messages = c?.messages || [];
  const attachments = c?.attachments || [];
  const privateNotes = messages.filter((m) => m.visibility === "admin_only");
  const emptyDetailFields = c
    ? (
        [
          ["People involved / witnesses", c.peopleInvolved],
          ["Investigation", c.investigation],
          ["Outcome", c.outcome],
        ] as const
      ).filter(([, value]) => !hasCaseField(value))
    : [];
  const hasEmptyDetails = emptyDetailFields.length > 0;
  const empId = c?.employeeId || c?.employee?.id || "";

  return (
    <AppShell user={user} nav={adminNav} title={c ? c.ref : "Case"}>
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
            onClick={() => router.push("/admin/cases")}
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
                href="/admin/cases"
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
                className="btn btn-primary btn-sm"
                onClick={() => setEditOpen(true)}
              >
                Edit overview
              </button>
              <RowActionsMenu
                label={`Actions for ${c.ref}`}
                items={[
                  {
                    id: "client",
                    label: "Open client",
                    icon: <Building2 size={14} strokeWidth={1.75} />,
                    disabled: !c.organisation?.id,
                    onSelect: () =>
                      router.push(`/admin/organisations/${c.organisation!.id}`),
                  },
                  {
                    id: "client-cases",
                    label: "Cases for this client",
                    icon: <FolderOpen size={14} strokeWidth={1.75} />,
                    disabled: !c.organisation?.id,
                    onSelect: () =>
                      router.push(
                        `/admin/cases?org=${encodeURIComponent(c.organisation!.id)}`
                      ),
                  },
                  {
                    id: "employee",
                    label: "Open employee",
                    icon: <Briefcase size={14} strokeWidth={1.75} />,
                    disabled: !empId,
                    onSelect: () => router.push(`/admin/employees/${empId}`),
                  },
                  {
                    id: "delete",
                    label: "Delete",
                    icon: <Trash2 size={14} strokeWidth={1.75} />,
                    tone: "danger",
                    separatorBefore: true,
                    disabled: busy,
                    onSelect: () => onDelete(),
                  },
                ]}
              />
            </div>
          </div>

          <div className="case-hub-layout">
            <div className="case-hub-main">
              <section className="panel case-hub-panel case-hub-panel--overview">
                <div className="case-hub-panel-head">
                  <h2>Case overview</h2>
                  <p className="lead">
                    Submitted {formatCaseDate(c.createdAt)} · Updated{" "}
                    {formatCaseDate(c.updatedAt)}
                    {c.createdBy?.name
                      ? ` · Opened by ${c.createdBy.name}`
                      : null}
                  </p>
                </div>

                <div className="case-hub-panel-scroll">
                  <div className="case-overview-grid">
                    <div>
                      <span className="profile-meta-label">Client organisation</span>
                      <span className="profile-meta-value">
                        {c.organisation?.id ? (
                          <Link
                            href={`/admin/organisations/${c.organisation.id}`}
                            className="case-inline-link"
                          >
                            {c.organisation.name}
                          </Link>
                        ) : (
                          c.organisation?.name || "—"
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="profile-meta-label">Category</span>
                      <span className="profile-meta-value">
                        {categoryDisplayName(c.category, c.categoryOther)}
                      </span>
                    </div>
                    <div>
                      <span className="profile-meta-label">Related employee</span>
                      <span className="profile-meta-value">
                        {c.employee && empId ? (
                          <Link
                            href={`/admin/employees/${empId}`}
                            className="case-inline-link"
                          >
                            {c.employee.name}
                          </Link>
                        ) : (
                          c.employee?.name || "—"
                        )}
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

                  {hasEmptyDetails ? (
                    <div className="case-overview-complete">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setEditOpen(true)}
                      >
                        Complete overview
                      </button>
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="panel case-hub-panel case-hub-panel--files">
                <div className="case-hub-panel-head">
                  <h2>Files</h2>
                </div>

                <div className="case-hub-panel-scroll">
                  {attachments.length === 0 ? (
                    <p className="lead" style={{ margin: 0, fontSize: "0.85rem" }}>
                      No attachments yet. Attach PDFs when publishing an update.
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
                                  url: `${API_URL}/admin/case-attachments/${a.id}/download`,
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
                            <IconButton
                              label={`Remove ${a.fileName}`}
                              danger
                              disabled={busy}
                              onClick={() => onDeleteAttachment(a.id, a.fileName)}
                            >
                              <Trash2 size={16} strokeWidth={1.75} />
                            </IconButton>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              <CaseTimeline messages={messages} role="admin" />

              <section className="panel case-hub-panel case-composer">
                <form onSubmit={onMessage} className="form-compact">
                  <h3>Publish update</h3>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="case-vis">Visibility</label>
                      <PortalSelect
                        id="case-vis"
                        aria-label="Visibility"
                        value={visibility}
                        options={[
                          { value: "client_visible", label: "Visible to client" },
                          { value: "admin_only", label: "Admin-only private note" },
                        ]}
                        onChange={(v) =>
                          setVisibility(v as "client_visible" | "admin_only")
                        }
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="case-msg">Message</label>
                    <textarea
                      id="case-msg"
                      rows={3}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      required
                      placeholder="Write an update or private note…"
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
                    {posting
                      ? "Posting…"
                      : visibility === "admin_only"
                        ? "Save private note"
                        : "Publish update"}
                  </button>
                </form>
              </section>
            </div>

            <aside className="case-hub-aside">
              <section className="panel case-hub-panel">
                <h2>Case information</h2>
                <div className="case-aside-block">
                  <span className="profile-meta-label">Case status</span>
                  <form onSubmit={onStatus} className="case-status-form form-compact">
                    <div className="field">
                      <label htmlFor="case-status" className="sr-only">
                        Update status
                      </label>
                      <PortalSelect
                        id="case-status"
                        aria-label="Case status"
                        size="sm"
                        value={status}
                        options={CASE_STATUSES.map((s) => ({
                          value: s.value,
                          label: s.label,
                        }))}
                        onChange={setStatus}
                      />
                    </div>
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm"
                      disabled={statusSaving || status === c.status}
                    >
                      {statusSaving ? "Saving…" : "Save status"}
                    </button>
                  </form>
                </div>
                <div className="case-aside-block">
                  <span className="profile-meta-label">Latest private note</span>
                  <p className="case-aside-note">
                    {privateNotes.length
                      ? privateNotes[privateNotes.length - 1].body
                      : "No private notes yet."}
                  </p>
                  <p className="lead" style={{ margin: "0 0 8px", fontSize: "0.72rem" }}>
                    Same as Admin-only in Publish update — appears in the timeline, not a separate notepad.
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setVisibility("admin_only");
                      const el = document.getElementById("case-msg");
                      el?.scrollIntoView({ behavior: "smooth", block: "center" });
                      el?.focus();
                    }}
                  >
                    + Write private note
                  </button>
                </div>
                <div className="case-aside-block">
                  <span className="profile-meta-label">Notifications</span>
                  <p className="lead" style={{ margin: "4px 0 0", fontSize: "0.78rem" }}>
                    Client-visible updates notify portal users. Private notes stay admin-only.
                  </p>
                </div>
              </section>
            </aside>
          </div>

          <CaseFormDialog
            open={editOpen}
            mode="edit"
            role="admin"
            categories={categories}
            caseRow={c}
            onClose={closeEdit}
            onSaved={() => {
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

export default function AdminCaseDetailPage() {
  return (
    <Suspense
      fallback={
        <main className="auth-shell">
          <p className="lead">Loading case…</p>
        </main>
      }
    >
      <AdminCaseDetailInner />
    </Suspense>
  );
}
