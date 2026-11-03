"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  CircleCheck,
  Eye,
  PenLine,
  Trash2,
} from "lucide-react";
import { AppShell } from "../../../../components/AppShell";
import { DocsDropzone } from "../../../../components/DocsDropzone";
import { FilePreviewSheet, type FilePreviewTarget } from "../../../../components/FilePreviewSheet";
import { FirmLibraryPrepareSheet } from "../../../../components/FirmLibraryPrepareSheet";
import { IconButton } from "../../../../components/IconButton";
import { PortalSelect } from "../../../../components/PortalSelect";
import { ListSkeleton } from "../../../../components/Skeleton";
import { useConfirm } from "../../../../context/ConfirmContext";
import { useToast } from "../../../../context/ToastContext";
import { API_URL, apiFetch, apiUpload, type PublicUser } from "../../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../../lib/auth";
import { adminNav } from "../../../../lib/nav";
import {
  JOURNEY_ROLE_LABELS,
  journeyRolePillClass,
  type JourneyRole,
} from "../../../../lib/onboarding";
import { isPdfDocument } from "../../../../lib/signatures";

type LibraryDoc = {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  requiresSignature: boolean;
  journeyRole?: JourneyRole | string;
  sortOrder: number;
  createdAt: string;
  fieldCount?: number;
  adminInkReady?: boolean;
};

const JOURNEY_ROLE_OPTIONS = (Object.keys(JOURNEY_ROLE_LABELS) as JourneyRole[]).map(
  (value) => ({
    value,
    label: JOURNEY_ROLE_LABELS[value],
  })
);

function readinessLabel(doc: LibraryDoc): string {
  if (!doc.requiresSignature) return "No signature";
  if (doc.fieldCount && doc.adminInkReady !== false) {
    return `${doc.fieldCount} box(es) · Admin ink ready`;
  }
  if (doc.fieldCount) return "Boxes placed — sign Admin ink";
  return "Prepare boxes";
}

function readinessTone(doc: LibraryDoc): "ok" | "progress" | "muted" | "warn" {
  if (!doc.requiresSignature) return "muted";
  if (doc.fieldCount && doc.adminInkReady !== false) return "ok";
  if (doc.fieldCount) return "warn";
  return "progress";
}

export default function AdminFirmLibraryOnboardingPage() {
  const router = useRouter();
  const { confirm } = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [docs, setDocs] = useState<LibraryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [requiresSignature, setRequiresSignature] = useState(true);
  const [journeyRole, setJourneyRole] = useState<JourneyRole>("other");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [prepareId, setPrepareId] = useState<string | null>(null);
  const [preview, setPreview] = useState<FilePreviewTarget | null>(null);

  async function load(token: string | null) {
    setLoading(true);
    const result = await apiFetch<{ documents: LibraryDoc[] }>("/admin/firm-library", {
      token,
    });
    if (result.success) {
      setDocs(result.data.documents);
    } else {
      toastError(result.error.message);
    }
    setLoading(false);
  }

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "admin") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
    void load(token);
  }, [router, toastError]);

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      toastError("Choose a PDF to add as a pack template.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (title.trim()) fd.append("title", title.trim());
      fd.append("requiresSignature", requiresSignature ? "true" : "false");
      fd.append("journeyRole", journeyRole);
      const result = await apiUpload<{ document: LibraryDoc }>(
        "/admin/firm-library",
        fd,
        getToken()
      );
      if (!result.success) {
        toastError(result.error.message);
        return;
      }
      toastSuccess(`Added “${result.data.document.title}” to Onboarding pack.`);
      setTitle("");
      setFile(null);
      setRequiresSignature(true);
      setJourneyRole("other");
      await load(getToken());
      if (
        result.data.document.requiresSignature &&
        isPdfDocument(result.data.document.mimeType, result.data.document.fileName)
      ) {
        setPrepareId(result.data.document.id);
      }
    } catch {
      toastError("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function toggleSign(doc: LibraryDoc) {
    const result = await apiFetch<{ document: LibraryDoc }>(`/admin/firm-library/${doc.id}`, {
      method: "PATCH",
      token: getToken(),
      body: JSON.stringify({ requiresSignature: !doc.requiresSignature }),
    });
    if (!result.success) {
      toastError(result.error.message);
      return;
    }
    toastSuccess(
      doc.requiresSignature
        ? `“${doc.title}” marked as no signature.`
        : `“${doc.title}” requires signature.`
    );
    await load(getToken());
  }

  async function setDocJourneyRole(doc: LibraryDoc, next: JourneyRole) {
    const result = await apiFetch<{ document: LibraryDoc }>(`/admin/firm-library/${doc.id}`, {
      method: "PATCH",
      token: getToken(),
      body: JSON.stringify({ journeyRole: next }),
    });
    if (!result.success) {
      toastError(result.error.message);
      return;
    }
    await load(getToken());
  }

  async function remove(doc: LibraryDoc) {
    const ok = await confirm({
      title: "Remove pack template?",
      description: `Remove “${doc.title}” from Onboarding pack? Existing issued client packs are not deleted.`,
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    const result = await apiFetch(`/admin/firm-library/${doc.id}`, {
      method: "DELETE",
      token: getToken(),
    });
    if (!result.success) {
      toastError(result.error.message);
      return;
    }
    toastSuccess("Removed from Onboarding pack.");
    await load(getToken());
  }

  function openPreview(doc: LibraryDoc) {
    setPreview({
      title: doc.title,
      url: `${API_URL}/admin/firm-library/${doc.id}/file`,
      fileName: doc.fileName,
      mimeType: doc.mimeType || "application/pdf",
    });
  }

  if (!user) return null;

  return (
    <AppShell user={user} nav={adminNav} title="Onboarding pack">
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
            <h1>Onboarding pack</h1>
            <div className="profile-hub-meta">
              Upload once · set stage · prepare boxes &amp; Admin ink · issue from Onboarding
            </div>
          </div>
        </div>
        <div className="profile-hub-actions">
          <Link href="/admin/onboarding" className="btn btn-secondary btn-sm">
            Open Onboarding
          </Link>
        </div>
      </div>

      <section className="panel form-compact firm-pack-add" style={{ marginBottom: 16 }}>
        <h2>Add template</h2>
        <p className="lead firm-pack-lead">
          Place Client or Admin boxes once. Admin ink is saved forever and applied when you issue
          the pack. Stage tags drive Welcome / Compliance / Terms on the journey checklist.
        </p>
        <form onSubmit={onUpload} className="firm-pack-add-form">
          <div className="firm-pack-add-grid">
            <div className="field">
              <label htmlFor="libTitle">Title (optional)</label>
              <input
                id="libTitle"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Terms of Business"
              />
            </div>
            <div className="field">
              <label htmlFor="libJourneyRole">Onboarding stage</label>
              <PortalSelect
                id="libJourneyRole"
                value={journeyRole}
                onChange={(v) => setJourneyRole((v as JourneyRole) || "other")}
                options={JOURNEY_ROLE_OPTIONS}
                aria-label="Onboarding stage"
                size="sm"
              />
            </div>
          </div>
          <div className="field">
            <label>PDF template</label>
            <DocsDropzone
              multiple={false}
              busy={uploading}
              accept=".pdf,application/pdf"
              hint="PDF only · drag and drop or select"
              title="Drop a PDF template here"
              selectLabel="Select PDF"
              compact
              onFiles={(picked) => setFile(picked[0] || null)}
            />
            {file ? (
              <ul className="docs-file-chips">
                <li className="docs-file-chip-item">
                  <span>{file.name}</span>
                  <button
                    type="button"
                    className="docs-file-chip-remove"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setFile(null)}
                    disabled={uploading}
                  >
                    ×
                  </button>
                </li>
              </ul>
            ) : null}
          </div>
          <div className="firm-pack-add-foot">
            <label className="check-inline firm-pack-check">
              <input
                type="checkbox"
                checked={requiresSignature}
                onChange={(e) => setRequiresSignature(e.target.checked)}
              />
              Requires client / admin signature (default on)
            </label>
            <button className="btn btn-primary btn-sm" type="submit" disabled={uploading}>
              {uploading ? "Uploading…" : "Add template"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel firm-pack-templates">
        <div className="firm-pack-templates-head">
          <div>
            <h2>Templates</h2>
            <p className="firm-pack-templates-sub">
              {loading
                ? "Loading…"
                : `${docs.length} template${docs.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
        {loading ? (
          <ListSkeleton rows={4} />
        ) : docs.length === 0 ? (
          <div className="docs-empty empty-state">
            <p>No pack templates yet</p>
            <p className="lead">
              Add Terms of Business, Welcome pack, and Compliance PDFs, then prepare boxes.
            </p>
          </div>
        ) : (
          <div className="firm-pack-templates-body dmhr-scroll">
            <ul className="firm-pack-list">
              {docs.map((doc) => {
                const pdf = isPdfDocument(doc.mimeType, doc.fileName);
                const roleKey = (String(doc.journeyRole || "other").toLowerCase() ||
                  "other") as JourneyRole;
                const readyTone = readinessTone(doc);
                return (
                  <li key={doc.id} className="firm-pack-row">
                    <div className="firm-pack-row-main">
                      <div className="firm-pack-row-title">
                        <strong>{doc.title}</strong>
                        <span className={`status-pill ${journeyRolePillClass(roleKey)}`}>
                          {JOURNEY_ROLE_LABELS[roleKey] || "Other"}
                        </span>
                        <span
                          className={`status-pill status-pill-${
                            readyTone === "ok"
                              ? "ok"
                              : readyTone === "warn"
                                ? "warn"
                                : readyTone === "progress"
                                  ? "progress"
                                  : "muted"
                          }`}
                        >
                          {readinessLabel(doc)}
                        </span>
                      </div>
                      <div className="firm-pack-row-meta">{doc.fileName}</div>
                      <div className="firm-pack-row-stage">
                        <label className="sr-only" htmlFor={`role-${doc.id}`}>
                          Onboarding stage for {doc.title}
                        </label>
                        <PortalSelect
                          id={`role-${doc.id}`}
                          value={roleKey}
                          onChange={(v) =>
                            void setDocJourneyRole(doc, (v as JourneyRole) || "other")
                          }
                          options={JOURNEY_ROLE_OPTIONS}
                          size="sm"
                          aria-label={`Onboarding stage for ${doc.title}`}
                        />
                      </div>
                    </div>
                    <div className="firm-pack-row-actions">
                      {pdf ? (
                        <IconButton
                          label="Preview"
                          aria-label={`Preview ${doc.title}`}
                          side="bottom"
                          onClick={() => openPreview(doc)}
                        >
                          <Eye size={15} strokeWidth={1.75} />
                        </IconButton>
                      ) : null}
                      {doc.requiresSignature && pdf ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => setPrepareId(doc.id)}
                        >
                          <PenLine size={14} strokeWidth={1.75} aria-hidden />
                          {doc.fieldCount ? "Edit boxes" : "Prepare boxes"}
                        </button>
                      ) : null}
                      <IconButton
                        label={
                          doc.requiresSignature ? "Mark no signature" : "Require signature"
                        }
                        aria-label={
                          doc.requiresSignature
                            ? `Mark ${doc.title} as no signature`
                            : `Require signature for ${doc.title}`
                        }
                        side="bottom"
                        onClick={() => void toggleSign(doc)}
                      >
                        {doc.requiresSignature ? (
                          <Ban size={15} strokeWidth={1.75} />
                        ) : (
                          <CircleCheck size={15} strokeWidth={1.75} />
                        )}
                      </IconButton>
                      <IconButton
                        label="Remove"
                        aria-label={`Remove ${doc.title}`}
                        side="bottom"
                        danger
                        onClick={() => void remove(doc)}
                      >
                        <Trash2 size={15} strokeWidth={1.75} />
                      </IconButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {prepareId ? (
        <FirmLibraryPrepareSheet
          documentId={prepareId}
          onClose={() => setPrepareId(null)}
          onSaved={() => load(getToken())}
        />
      ) : null}

      <FilePreviewSheet target={preview} onClose={() => setPreview(null)} />
    </AppShell>
  );
}
