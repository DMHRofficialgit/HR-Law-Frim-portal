"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "../../../../components/AppShell";
import { API_URL, apiFetch, type PublicUser } from "../../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../../lib/auth";
import { statusLabel } from "../../../../lib/cases";
import { clientNav } from "../../../../lib/nav";

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
    createdAt: string;
    author: { name: string; role: string } | null;
  }>;
  attachments: Array<{ id: string; fileName: string; sizeBytes: number }>;
};

function PortalCaseDetailInner() {
  const params = useParams();
  const id = String(params.id || "");
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [c, setCase] = useState<CaseDetail | null>(null);
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const result = await apiFetch<{ case: CaseDetail }>(`/client/cases/${id}`, {
      token: getToken(),
    });
    if (result.success) {
      setCase(result.data.case);
      setError("");
    } else setError(result.error.message);
  }, [id]);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "client") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
    load();
  }, [router, load]);

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  async function onReply(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const form = new FormData();
      form.append("body", reply);
      if (files) Array.from(files).forEach((f) => form.append("files", f));
      const res = await fetch(`${API_URL}/client/cases/${id}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      });
      const body = await res.json();
      if (!body.success) {
        setError(body.error?.message || "Reply failed");
        return;
      }
      setReply("");
      setFiles(null);
      setCase(body.data.case);
      await load();
    } catch {
      setError("Reply failed");
    } finally {
      setSaving(false);
    }
  }

  async function download(attId: string, fileName: string) {
    const res = await fetch(`${API_URL}/client/case-attachments/${attId}/download`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) {
      setError("Download failed");
      return;
    }
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
    <AppShell user={user} nav={clientNav} title={c ? c.ref : "Case"}>
      {error ? <div className="error-banner">{error}</div> : null}

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
            <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{c.description}</p>
          </section>

          <section className="panel" style={{ marginBottom: 16 }}>
            <h2>Updates</h2>
            <ul className="org-list">
              {c.messages.map((m) => (
                <li key={m.id}>
                  <div>
                    <div className="org-name">{m.author?.name || "System"}</div>
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
            <h2>Reply</h2>
            <p className="lead">You can reply at any status — including Information required.</p>
            <form onSubmit={onReply}>
              <div className="field">
                <label>Message</label>
                <textarea
                  rows={4}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  required
                />
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
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "Sending…" : "Send reply"}
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

export default function PortalCaseDetailPage() {
  return (
    <Suspense
      fallback={
        <main className="auth-shell">
          <p className="lead">Loading case…</p>
        </main>
      }
    >
      <PortalCaseDetailInner />
    </Suspense>
  );
}
