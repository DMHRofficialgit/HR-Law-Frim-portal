"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "../../../../components/AppShell";
import { PortalSelect } from "../../../../components/PortalSelect";
import { API_URL, apiFetch, type PublicUser } from "../../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../../lib/auth";
import { CASE_STATUSES, statusLabel } from "../../../../lib/cases";
import { adminNav } from "../../../../lib/nav";

type CaseDetail = {
  id: string;
  ref: string;
  title: string;
  description: string;
  status: string;
  category: { name: string };
  employee: { name: string } | null;
  messages: Array<{
    id: string;
    body: string;
    visibility: string;
    createdAt: string;
    author: { name: string; role: string } | null;
  }>;
  attachments: Array<{ id: string; fileName: string }>;
};

function AdminCaseDetailInner() {
  const params = useParams();
  const id = String(params.id || "");
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [c, setCase] = useState<CaseDetail | null>(null);
  const [status, setStatus] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"client_visible" | "admin_only">("client_visible");
  const [files, setFiles] = useState<FileList | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const result = await apiFetch<{ case: CaseDetail }>(`/admin/cases/${id}`, {
      token: getToken(),
    });
    if (result.success) {
      setCase(result.data.case);
      setStatus(result.data.case.status);
      setError("");
    } else setError(result.error.message);
  }, [id]);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "admin") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
    load();
  }, [router, load]);

  async function refresh() {
    setRefreshing(true);
    setNotice("");
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  async function onStatus(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    const result = await apiFetch<{ case: CaseDetail }>(`/admin/cases/${id}/status`, {
      method: "PATCH",
      token: getToken(),
      body: JSON.stringify({ status }),
    });
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setCase(result.data.case);
    setStatus(result.data.case.status);
    setNotice("Status updated.");
    await load();
  }

  async function onMessage(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    const form = new FormData();
    form.append("body", body);
    form.append("visibility", visibility);
    if (files) Array.from(files).forEach((f) => form.append("files", f));
    const res = await fetch(`${API_URL}/admin/cases/${id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: form,
    });
    const json = await res.json();
    if (!json.success) {
      setError(json.error?.message || "Failed");
      return;
    }
    setCase(json.data.case);
    setBody("");
    setFiles(null);
    setNotice(visibility === "admin_only" ? "Private note saved." : "Client update posted.");
    await load();
  }

  async function download(attId: string, fileName: string) {
    const res = await fetch(`${API_URL}/admin/case-attachments/${attId}/download`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!user) return null;

  return (
    <AppShell user={user} nav={adminNav} title={c ? c.ref : "Case"}>
      {error ? <div className="error-banner">{error}</div> : null}
      {notice ? <div className="success-banner">{notice}</div> : null}

      <div style={{ marginBottom: 12 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={refresh} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {c ? (
        <>
          <section className="panel" style={{ marginBottom: 16 }}>
            <h2>{c.title}</h2>
            <p className="lead">
              {c.category.name} · {statusLabel(c.status)}
              {c.employee ? ` · ${c.employee.name}` : ""}
            </p>
            <p style={{ whiteSpace: "pre-wrap", margin: "0 0 16px" }}>{c.description}</p>
            <form onSubmit={onStatus} className="form-grid">
              <div className="field">
                <label>Status</label>
                <PortalSelect
                  aria-label="Status"
                  value={status}
                  options={CASE_STATUSES.map((s) => ({
                    value: s.value,
                    label: s.label,
                  }))}
                  onChange={setStatus}
                />
              </div>
              <div className="field" style={{ display: "flex", alignItems: "flex-end" }}>
                <button className="btn btn-secondary" type="submit">
                  Update status
                </button>
              </div>
            </form>
          </section>

          <section className="panel" style={{ marginBottom: 16 }}>
            <h2>Thread</h2>
            <ul className="org-list">
              {c.messages.map((m) => (
                <li key={m.id}>
                  <div>
                    <div className="org-name">
                      {m.author?.name || "System"}
                      {m.visibility === "admin_only" ? " · Private note" : ""}
                    </div>
                    <div className="org-meta">{new Date(m.createdAt).toLocaleString()}</div>
                    <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{m.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {c.attachments.length > 0 ? (
            <section className="panel" style={{ marginBottom: 16 }}>
              <h2>Attachments</h2>
              <ul className="org-list">
                {c.attachments.map((a) => (
                  <li key={a.id}>
                    <div className="org-name">{a.fileName}</div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => download(a.id, a.fileName)}
                    >
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="panel">
            <h2>Post update</h2>
            <form onSubmit={onMessage}>
              <div className="field">
                <label>Visibility</label>
                <PortalSelect
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
              <div className="field">
                <label>Message</label>
                <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} required />
              </div>
              <div className="field">
                <label>Attachments (optional)</label>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => setFiles(e.target.files)}
                />
              </div>
              <button className="btn btn-primary" type="submit">
                Post
              </button>
            </form>
          </section>
        </>
      ) : (
        <p className="lead">Loading…</p>
      )}
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
