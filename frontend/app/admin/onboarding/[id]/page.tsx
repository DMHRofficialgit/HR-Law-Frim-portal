"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "../../../../components/AppShell";
import { EsignSheet } from "../../../../components/EsignSheet";
import { apiFetch, type PublicUser } from "../../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../../lib/auth";
import { adminNav } from "../../../../lib/nav";
import {
  journeyStages,
  onboardingRunLabel,
  packItemLabel,
  packProgress,
  paymentUrl,
  type OnboardingPackItem,
  type OnboardingRun,
} from "../../../../lib/onboarding";
import { isPdfDocument } from "../../../../lib/signatures";

type LibraryDoc = {
  id: string;
  title: string;
  requiresSignature: boolean;
  fileName: string;
  fieldCount?: number;
  adminInkReady?: boolean;
};

export default function AdminOnboardingDetailPage() {
  const router = useRouter();
  const params = useParams();
  const runId = String(params.id || "");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [run, setRun] = useState<OnboardingRun | null>(null);
  const [canComplete, setCanComplete] = useState(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryDoc[]>([]);
  const [selectedLib, setSelectedLib] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [ddUrl, setDdUrl] = useState("");
  const [payUrl, setPayUrl] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [esignId, setEsignId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    const result = await apiFetch<{
      run: OnboardingRun;
      canComplete: boolean;
      completeBlockReason: string | null;
    }>(`/admin/onboarding/runs/${runId}`, { token });
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setRun(result.data.run);
    setCanComplete(result.data.canComplete);
    setBlockReason(result.data.completeBlockReason);
    setSubject(result.data.run.welcomeEmailSubject || "");
    setBody(result.data.run.welcomeEmailBody || "");
    setDdUrl(paymentUrl(result.data.run, "direct_debit"));
    setPayUrl(paymentUrl(result.data.run, "initial_payment"));
  }, [runId]);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "admin") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
    (async () => {
      await load();
      const lib = await apiFetch<{ documents: LibraryDoc[] }>("/admin/firm-library", { token });
      if (lib.success) setLibrary(lib.data.documents);
    })();
  }, [router, load]);

  async function sendWelcome(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await apiFetch<{ run: OnboardingRun }>(
        `/admin/onboarding/runs/${runId}/welcome-email`,
        {
          method: "POST",
          token: getToken(),
          body: JSON.stringify({ subject, body }),
        }
      );
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setNotice("Welcome email sent.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function issuePack() {
    if (!selectedLib.length) {
      setError("Select at least one Firm Library document.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await apiFetch<{ run: OnboardingRun }>(
        `/admin/onboarding/runs/${runId}/issue-pack`,
        {
          method: "POST",
          token: getToken(),
          body: JSON.stringify({ libraryDocumentIds: selectedLib }),
        }
      );
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setNotice("Pack issued to My Onboarding.");
      setSelectedLib([]);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function savePayment(kind: "direct_debit" | "initial_payment", url: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await apiFetch<{ run: OnboardingRun }>(
        `/admin/onboarding/runs/${runId}/payment-links`,
        {
          method: "PUT",
          token: getToken(),
          body: JSON.stringify({ kind, url }),
        }
      );
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setNotice(
        kind === "direct_debit" ? "Direct Debit link saved." : "Initial payment link saved."
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function requestSignature(item: OnboardingPackItem) {
    if (!run || !item.clientDocumentId) return;
    setError("");
    const title = item.title;
    if (!isPdfDocument(null, title) && !isPdfDocument(null, item.clientDocument?.title)) {
      // Allow — backend copies from document mime; only block if clearly not pdf by name
    }
    const result = await apiFetch<{ request: { id: string }; reused?: boolean }>(
      "/admin/signature-requests/from-document",
      {
        method: "POST",
        token: getToken(),
        body: JSON.stringify({
          organisationId: run.organisationId,
          sourceDocumentId: item.clientDocumentId,
          title: item.title,
        }),
      }
    );
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    await apiFetch(`/admin/onboarding/pack-items/${item.id}/link-signature`, {
      method: "POST",
      token: getToken(),
      body: JSON.stringify({ signatureRequestId: result.data.request.id }),
    });
    setEsignId(result.data.request.id);
    await load();
  }

  async function markComplete() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await apiFetch<{ run: OnboardingRun }>(
        `/admin/onboarding/runs/${runId}/complete`,
        { method: "POST", token: getToken(), body: "{}" }
      );
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setNotice("Onboarding complete — company is a full DM.HR client.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  const prog = run ? packProgress(run) : { done: 0, total: 0 };
  const stages = run ? journeyStages(run) : [];
  const issuedIds = new Set(
    (run?.packItems || [])
      .map((p) => p.libraryDocumentId)
      .filter((id): id is string => Boolean(id))
  );

  return (
    <AppShell
      user={user}
      nav={adminNav}
      title={run ? `Onboarding · ${run.organisation.name}` : "Onboarding"}
    >
      {error ? <div className="error-banner">{error}</div> : null}
      {notice ? <div className="success-banner">{notice}</div> : null}

      <div style={{ marginBottom: 16 }}>
        <Link href="/admin/onboarding" className="btn btn-secondary btn-sm">
          ← All onboarding
        </Link>
      </div>

      {!run ? (
        <section className="panel">
          <p className="lead">Loading…</p>
        </section>
      ) : (
        <>
          <section className="panel" style={{ marginBottom: 16 }}>
            <div className="row-between">
              <div>
                <h2>{run.organisation.name}</h2>
                <p className="lead" style={{ marginBottom: 0 }}>
                  Started {new Date(run.startedAt).toLocaleDateString()} · Pack {prog.done} of{" "}
                  {prog.total || "—"} · {onboardingRunLabel(run.status)}
                </p>
              </div>
              <span className="status-chip">{onboardingRunLabel(run.status)}</span>
            </div>
            <div className="progress-track" style={{ marginTop: 16 }}>
              <div
                className="progress-fill"
                style={{
                  width: `${stages.length ? (stages.filter((s) => s.done).length / stages.length) * 100 : 0}%`,
                }}
              />
            </div>
            <ul className="stage-list">
              {stages.map((s) => (
                <li key={s.key} className={s.done ? "done" : ""}>
                  <strong>{s.name}</strong>
                  <span>{s.status}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="grid-2">
            <section className="panel">
              <h2>1. Welcome email</h2>
              <p className="lead">
                Required before Complete. Edit, then send via SMTP (Admin Settings).
                {run.welcomeEmailSentAt
                  ? ` Sent ${new Date(run.welcomeEmailSentAt).toLocaleString()}.`
                  : " Not sent yet."}
              </p>
              <form onSubmit={sendWelcome}>
                <div className="field">
                  <label htmlFor="subj">Subject</label>
                  <input
                    id="subj"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                    disabled={run.status !== "in_progress"}
                  />
                </div>
                <div className="field">
                  <label htmlFor="body">Body</label>
                  <textarea
                    id="body"
                    rows={8}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    required
                    disabled={run.status !== "in_progress"}
                  />
                </div>
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={busy || run.status !== "in_progress"}
                >
                  {busy ? "Sending…" : "Send welcome email"}
                </button>
              </form>
            </section>

            <section className="panel">
              <h2>2–3. Issue pack → My Onboarding</h2>
              <p className="lead">
                Templates clone boxes + Admin ink automatically. Client signs their boxes; Admin
                countersign is already applied from Firm Library.
              </p>
              {library.length === 0 ? (
                <p className="org-meta">
                  Firm Library is empty.{" "}
                  <Link href="/admin/firm-library">Add templates</Link> first.
                </p>
              ) : (
                <ul className="check-list">
                  {library.map((doc) => {
                    const already = issuedIds.has(doc.id);
                    const layoutReady =
                      !doc.requiresSignature ||
                      (Boolean(doc.fieldCount) && doc.adminInkReady !== false);
                    return (
                      <li key={doc.id}>
                        <label>
                          <input
                            type="checkbox"
                            disabled={
                              already ||
                              run.status !== "in_progress" ||
                              (doc.requiresSignature && !layoutReady)
                            }
                            checked={already || selectedLib.includes(doc.id)}
                            onChange={(e) => {
                              if (already) return;
                              setSelectedLib((prev) =>
                                e.target.checked
                                  ? [...prev, doc.id]
                                  : prev.filter((id) => id !== doc.id)
                              );
                            }}
                          />
                          <span>
                            <strong>{doc.title}</strong>
                            <small>
                              {doc.requiresSignature
                                ? layoutReady
                                  ? `${doc.fieldCount} box(es) · Admin ink · auto-send`
                                  : doc.fieldCount
                                    ? "Sign Admin ink in Firm Library first"
                                    : "Prepare boxes in Firm Library first"
                                : "No signature"}
                              {already ? " · already issued" : ""}
                            </small>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: 12 }}
                onClick={issuePack}
                disabled={busy || run.status !== "in_progress" || !selectedLib.length}
              >
                Issue selected to My Onboarding
              </button>
            </section>
          </div>

          <section className="panel" style={{ marginTop: 16 }}>
            <h2>Pack items &amp; signatures</h2>
            <p className="lead">
              Admin ink is applied from Firm Library. Open a request to review — clients sign from
              My Onboarding / Signatures.
            </p>
            {run.packItems.length === 0 ? (
              <p className="org-meta">No pack items yet.</p>
            ) : (
              <ul className="org-list">
                {run.packItems.map((item) => (
                  <li key={item.id}>
                    <div>
                      <div className="org-name">{item.title}</div>
                      <div className="org-meta">
                        {item.requiresSignature
                          ? packItemLabel(item.status)
                          : "No signature · Done when issued"}
                        {item.signatureRequest
                          ? ` · e-sign: ${item.signatureRequest.status.replace(/_/g, " ")}`
                          : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {item.clientDocumentId ? (
                        <Link
                          href={`/admin/documents?org=${encodeURIComponent(run.organisationId)}`}
                          className="btn btn-secondary btn-sm"
                        >
                          My Onboarding folder
                        </Link>
                      ) : null}
                      {item.signatureRequestId ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => setEsignId(item.signatureRequestId)}
                        >
                          Open signature
                        </button>
                      ) : item.requiresSignature &&
                        item.clientDocumentId &&
                        run.status === "in_progress" ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => requestSignature(item)}
                        >
                          Manual request
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="grid-2" style={{ marginTop: 16 }}>
            <section className="panel">
              <h2>4. Direct Debit link</h2>
              <p className="lead">Paste the setup URL (payments = links only).</p>
              <div className="field">
                <label htmlFor="dd">URL</label>
                <input
                  id="dd"
                  type="url"
                  value={ddUrl}
                  onChange={(e) => setDdUrl(e.target.value)}
                  placeholder="https://"
                  disabled={run.status !== "in_progress"}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || run.status !== "in_progress" || !ddUrl.trim()}
                onClick={() => savePayment("direct_debit", ddUrl.trim())}
              >
                Save Direct Debit link
              </button>
            </section>
            <section className="panel">
              <h2>5. Initial payment link</h2>
              <p className="lead">Paste the payment URL for the client.</p>
              <div className="field">
                <label htmlFor="pay">URL</label>
                <input
                  id="pay"
                  type="url"
                  value={payUrl}
                  onChange={(e) => setPayUrl(e.target.value)}
                  placeholder="https://"
                  disabled={run.status !== "in_progress"}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || run.status !== "in_progress" || !payUrl.trim()}
                onClick={() => savePayment("initial_payment", payUrl.trim())}
              >
                Save payment link
              </button>
            </section>
          </div>

          <section className="panel" style={{ marginTop: 16 }}>
            <h2>6. Mark Complete</h2>
            <p className="lead">
              Admin only. Company becomes a full DM.HR client when welcome email, pack signatures,
              and both payment links are done.
            </p>
            {!canComplete && blockReason ? (
              <p className="org-meta">{blockReason}</p>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !canComplete || run.status !== "in_progress"}
              onClick={markComplete}
            >
              Mark onboarding complete
            </button>
          </section>
        </>
      )}

      {esignId ? (
        <EsignSheet
          requestId={esignId}
          role="admin"
          onClose={() => {
            setEsignId(null);
            load();
          }}
          onChanged={() => {
            load();
          }}
        />
      ) : null}
    </AppShell>
  );
}
