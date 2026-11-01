"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { FirmLibraryPrepareSheet } from "../../../components/FirmLibraryPrepareSheet";
import { apiFetch, apiUpload, type PublicUser } from "../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import { adminNav } from "../../../lib/nav";
import { isPdfDocument } from "../../../lib/signatures";

type LibraryDoc = {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  requiresSignature: boolean;
  sortOrder: number;
  createdAt: string;
  fieldCount?: number;
  adminInkReady?: boolean;
};

export default function AdminFirmLibraryPage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [docs, setDocs] = useState<LibraryDoc[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [title, setTitle] = useState("");
  const [requiresSignature, setRequiresSignature] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [prepareId, setPrepareId] = useState<string | null>(null);

  async function load(token: string | null) {
    const result = await apiFetch<{ documents: LibraryDoc[] }>("/admin/firm-library", {
      token,
    });
    if (result.success) setDocs(result.data.documents);
    else setError(result.error.message);
  }

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "admin") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
    load(token);
  }, [router]);

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose a file to add to Firm Library.");
      return;
    }
    setError("");
    setNotice("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (title.trim()) fd.append("title", title.trim());
      fd.append("requiresSignature", requiresSignature ? "true" : "false");
      const result = await apiUpload<{ document: LibraryDoc }>(
        "/admin/firm-library",
        fd,
        getToken()
      );
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setNotice(`Added “${result.data.document.title}” to Firm Library.`);
      setTitle("");
      setFile(null);
      setRequiresSignature(true);
      await load(getToken());
      if (
        result.data.document.requiresSignature &&
        isPdfDocument(result.data.document.mimeType, result.data.document.fileName)
      ) {
        setPrepareId(result.data.document.id);
      }
    } catch {
      setError("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function toggleSign(doc: LibraryDoc) {
    setError("");
    const result = await apiFetch<{ document: LibraryDoc }>(`/admin/firm-library/${doc.id}`, {
      method: "PATCH",
      token: getToken(),
      body: JSON.stringify({ requiresSignature: !doc.requiresSignature }),
    });
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    await load(getToken());
  }

  async function remove(doc: LibraryDoc) {
    if (!window.confirm(`Remove “${doc.title}” from Firm Library?`)) return;
    setError("");
    const result = await apiFetch(`/admin/firm-library/${doc.id}`, {
      method: "DELETE",
      token: getToken(),
    });
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setNotice("Removed from Firm Library.");
    await load(getToken());
  }

  if (!user) return null;

  return (
    <AppShell user={user} nav={adminNav} title="Firm Library">
      {error ? <div className="error-banner">{error}</div> : null}
      {notice ? <div className="success-banner">{notice}</div> : null}

      <section className="panel" style={{ marginBottom: 20 }}>
        <h2>Add template</h2>
        <p className="lead">
          Upload once. Place boxes with Client or Admin roles. Sign Admin boxes here forever —
          every new client pack reuses layout + Admin ink automatically.
        </p>
        <form onSubmit={onUpload}>
          <div className="form-grid">
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
              <label htmlFor="libFile">File</label>
              <input
                id="libFile"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required
              />
            </div>
          </div>
          <label className="check-inline" style={{ display: "flex", gap: 8, margin: "12px 0" }}>
            <input
              type="checkbox"
              checked={requiresSignature}
              onChange={(e) => setRequiresSignature(e.target.checked)}
            />
            Requires client / admin signature (default on)
          </label>
          <button className="btn btn-primary" type="submit" disabled={uploading}>
            {uploading ? "Uploading…" : "Add to Firm Library"}
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Library</h2>
        <p className="lead">{docs.length} template(s)</p>
        {docs.length === 0 ? (
          <p className="org-meta">No templates yet. Add Terms of Business and welcome materials.</p>
        ) : (
          <ul className="org-list">
            {docs.map((doc) => {
              const pdf = isPdfDocument(doc.mimeType, doc.fileName);
              const ready =
                !doc.requiresSignature ||
                (doc.fieldCount !== undefined &&
                  doc.fieldCount > 0 &&
                  doc.adminInkReady !== false);
              return (
                <li key={doc.id}>
                  <div>
                    <div className="org-name">{doc.title}</div>
                    <div className="org-meta">
                      {doc.fileName} ·{" "}
                      {doc.requiresSignature
                        ? ready
                          ? `${doc.fieldCount} box(es) · Admin ink ready`
                          : doc.fieldCount
                            ? "Boxes placed — sign Admin ink"
                            : "Signature required — prepare boxes"
                        : "No signature"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {doc.requiresSignature && pdf ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => setPrepareId(doc.id)}
                      >
                        {doc.fieldCount ? "Edit boxes / Admin ink" : "Prepare boxes"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => toggleSign(doc)}
                    >
                      {doc.requiresSignature ? "Mark no signature" : "Require signature"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => remove(doc)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {prepareId ? (
        <FirmLibraryPrepareSheet
          documentId={prepareId}
          onClose={() => setPrepareId(null)}
          onSaved={() => load(getToken())}
        />
      ) : null}
    </AppShell>
  );
}
