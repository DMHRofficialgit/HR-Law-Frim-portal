"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Eye, FileSignature, FolderOpen, PenLine } from "lucide-react";
import { AppShell } from "../../../../components/AppShell";
import { EsignSheet } from "../../../../components/EsignSheet";
import { FilePreviewSheet, type FilePreviewTarget } from "../../../../components/FilePreviewSheet";
import { IconButton } from "../../../../components/IconButton";
import { OnboardingStageList } from "../../../../components/OnboardingStageList";
import { PanelSkeleton } from "../../../../components/Skeleton";
import { useConfirm } from "../../../../context/ConfirmContext";
import { useToast } from "../../../../context/ToastContext";
import { API_URL, apiFetch, type PublicUser } from "../../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../../lib/auth";
import { adminNav } from "../../../../lib/nav";
import {
  onboardingRunBadgeTone,
  onboardingRunLabel,
  packAwaitingAdminReview,
  packItemStatusPill,
  packPreviewShowsUnsignedSource,
  packPreviewTarget,
  packProgress,
  paymentUrl,
  type OnboardingPackItem,
  type OnboardingRun,
} from "../../../../lib/onboarding";
type LibraryDoc = {
  id: string;
  title: string;
  requiresSignature: boolean;
  fileName: string;
  fieldCount?: number;
  adminInkReady?: boolean;
};

function AdminOnboardingDetailInner() {
  const router = useRouter();
  const params = useParams();
  const runId = String(params.id || "");
  const { error: toastError, success: toastSuccess } = useToast();
  const { confirm } = useConfirm();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [run, setRun] = useState<OnboardingRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [canComplete, setCanComplete] = useState(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryDoc[]>([]);
  const [selectedLib, setSelectedLib] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [ddUrl, setDdUrl] = useState("");
  const [payUrl, setPayUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [esignId, setEsignId] = useState<string | null>(null);
  const [preview, setPreview] = useState<FilePreviewTarget | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token || !runId) return;
    setLoading(true);
    const result = await apiFetch<{
      run: OnboardingRun;
      canComplete: boolean;
      completeBlockReason: string | null;
    }>(`/admin/onboarding/runs/${runId}`, { token });
    if (!result.success) {
      setError(result.error.message);
      toastError(result.error.message);
      setRun(null);
      setLoading(false);
      return;
    }
    setError("");
    setRun(result.data.run);
    setCanComplete(result.data.canComplete);
    setBlockReason(result.data.completeBlockReason);
    setSubject(result.data.run.welcomeEmailSubject || "");
    setBody(result.data.run.welcomeEmailBody || "");
    setDdUrl(paymentUrl(result.data.run, "direct_debit"));
    setPayUrl(paymentUrl(result.data.run, "initial_payment"));
    setLoading(false);
  }, [runId, toastError]);

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

  /** Issue selected templates (if any), then send welcome email if not yet sent. */
  async function sendWelcomePack() {
    if (!run) return;
    const alreadyIssued = new Set(
      run.packItems
        .map((p) => p.libraryDocumentId)
        .filter((id): id is string => Boolean(id))
    );
    const toIssue = selectedLib.filter((id) => !alreadyIssued.has(id));
    const needEmail = !run.welcomeEmailSentAt;

    if (!toIssue.length && !needEmail) {
      const msg = "Nothing to send — select templates or welcome already sent.";
      setError(msg);
      toastError(msg);
      return;
    }

    if (needEmail && (!subject.trim() || !body.trim())) {
      const msg = "Add welcome email subject and body before sending.";
      setError(msg);
      toastError(msg);
      return;
    }

    setBusy(true);
    setError("");
    let issuedOk = false;
    try {
      if (toIssue.length) {
        const result = await apiFetch<{ run: OnboardingRun }>(
          `/admin/onboarding/runs/${runId}/issue-pack`,
          {
            method: "POST",
            token: getToken(),
            body: JSON.stringify({ libraryDocumentIds: toIssue }),
          }
        );
        if (!result.success) {
          setError(result.error.message);
          toastError(result.error.message);
          return;
        }
        issuedOk = true;
        setSelectedLib([]);
      }

      if (needEmail) {
        const result = await apiFetch<{ run: OnboardingRun }>(
          `/admin/onboarding/runs/${runId}/welcome-email`,
          {
            method: "POST",
            token: getToken(),
            body: JSON.stringify({ subject, body }),
          }
        );
        if (!result.success) {
          const msg = issuedOk
            ? `Pack issued; email failed — ${result.error.message}`
            : result.error.message;
          setError(msg);
          toastError(msg);
          await load();
          return;
        }
        toastSuccess(
          issuedOk
            ? "Welcome pack sent — documents issued and email delivered."
            : "Welcome email sent."
        );
      } else if (issuedOk) {
        toastSuccess("Pack issued to My Onboarding.");
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function savePayment(kind: "direct_debit" | "initial_payment", url: string) {
    setBusy(true);
    setError("");
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
        toastError(result.error.message);
        return;
      }
      toastSuccess(
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
      toastError(result.error.message);
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
    if (!run) return;
    const ok = await confirm({
      title: "Mark onboarding complete?",
      description: `${run.organisation.name} becomes a full DM.HR client. This cannot be undone from this screen.`,
      confirmLabel: "Mark complete",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<{ run: OnboardingRun }>(
        `/admin/onboarding/runs/${runId}/complete`,
        { method: "POST", token: getToken(), body: "{}" }
      );
      if (!result.success) {
        setError(result.error.message);
        toastError(result.error.message);
        return;
      }
      toastSuccess("Onboarding complete — company is a full DM.HR client.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  const prog = run ? packProgress(run) : { done: 0, total: 0 };
  const issuedIds = new Set(
    (run?.packItems || [])
      .map((p) => p.libraryDocumentId)
      .filter((id): id is string => Boolean(id))
  );

  function openPackPreview(item: OnboardingPackItem) {
    if (!run?.organisationId) return;
    const target = packPreviewTarget(item, {
      role: "admin",
      organisationId: run.organisationId,
      apiUrl: API_URL,
    });
    if (!target) return;
    setPreview(target);
  }

  return (
    <AppShell
      user={user}
      nav={adminNav}
      title={run ? `Onboarding · ${run.organisation.name}` : "Onboarding"}
    >
      {error ? <div className="error-banner">{error}</div> : null}

      {loading && !run ? (
        <div className="panel">
          <PanelSkeleton lines={6} />
        </div>
      ) : null}

      {run ? (
        <>
          <div className="profile-hub-head">
            <div className="profile-hub-head-main">
              <IconButton
                href="/admin/onboarding"
                label="Back"
                aria-label="Back to onboarding list"
                side="bottom"
              >
                <ArrowLeft size={16} strokeWidth={1.75} />
              </IconButton>
              <div className="profile-hub-titles">
                <h1>{run.organisation.name}</h1>
                <div className="profile-hub-meta">
                  Started {new Date(run.startedAt).toLocaleDateString()}
                  <span aria-hidden>·</span>
                  Pack {prog.done} of {prog.total || "—"}
                  <span
                    className={`status-pill status-pill-${onboardingRunBadgeTone(run.status)}`}
                  >
                    {onboardingRunLabel(run.status)}
                  </span>
                </div>
              </div>
            </div>
            <div className="profile-hub-actions">
              <Link
                href={`/admin/organisations/${run.organisationId}`}
                className="btn btn-secondary btn-sm"
              >
                Open client
              </Link>
            </div>
          </div>

          <section className="panel" style={{ marginBottom: 16 }}>
            <OnboardingStageList run={run} />
          </section>

          <div className="grid-2">
            <section className="panel form-compact">
              <h2>1. Welcome email</h2>
              <p className="lead">
                Part of Send welcome pack (SMTP in Admin Settings).
                {run.welcomeEmailSentAt
                  ? ` Sent ${new Date(run.welcomeEmailSentAt).toLocaleString()}.`
                  : " Not sent yet."}
              </p>
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
            </section>

            <section className="panel">
              <h2>2. Pack documents → My Onboarding</h2>
              <p className="lead">
                Select templates to issue with boxes + Admin ink. Sent together with the welcome
                email via <strong>Send welcome pack</strong>.
              </p>
              {library.length === 0 ? (
                <p className="org-meta">
                  Firm Library is empty.{" "}
                  <Link href="/admin/firm-library/onboarding">Add templates</Link> first.
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
            </section>
          </div>

          <div
            className="panel"
            style={{
              marginTop: 12,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 12,
              justifyContent: "space-between",
            }}
          >
            <p className="org-meta" style={{ margin: 0, maxWidth: "36rem" }}>
              One action: issue selected templates (if any), then send the welcome email if not
              already sent. Disabled when welcome is sent and nothing new is selected.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void sendWelcomePack()}
              disabled={
                busy ||
                run.status !== "in_progress" ||
                (Boolean(run.welcomeEmailSentAt) &&
                  selectedLib.filter((id) => !issuedIds.has(id)).length === 0)
              }
            >
              {busy
                ? "Sending…"
                : run.welcomeEmailSentAt
                  ? "Issue selected to My Onboarding"
                  : "Send welcome pack"}
            </button>
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
                {run.packItems.map((item) => {
                  const awaitingReview = packAwaitingAdminReview(item);
                  const statusPill = packItemStatusPill(item);
                  const canPreview = Boolean(
                    packPreviewTarget(item, {
                      role: "admin",
                      organisationId: run.organisationId,
                      apiUrl: API_URL,
                    })
                  );
                  const unsignedPreview = packPreviewShowsUnsignedSource(item);
                  return (
                    <li key={item.id}>
                      <div>
                        <div
                          className="org-name"
                          style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}
                        >
                          <span>{item.title}</span>
                          <span className={`status-pill status-pill-${statusPill.tone}`}>
                            {statusPill.label}
                          </span>
                        </div>
                        {awaitingReview ? (
                          <div className="org-meta" style={{ marginTop: 4 }}>
                            Preview shows the stamped PDF. Mark complete in Open signature to
                            publish the Signed copy into My Onboarding.
                          </div>
                        ) : null}
                        {unsignedPreview ? (
                          <div className="org-meta" style={{ marginTop: 4 }}>
                            Preview is the unsigned source — Open signature to see boxes and Admin
                            ink until everyone has signed.
                          </div>
                        ) : null}
                      </div>
                      <div className="file-actions" style={{ gap: 6 }}>
                        {canPreview ? (
                          <IconButton
                            label="Preview"
                            aria-label={`Preview ${item.title}`}
                            onClick={() => openPackPreview(item)}
                          >
                            <Eye size={15} strokeWidth={1.75} />
                          </IconButton>
                        ) : null}
                        {item.clientDocumentId ? (
                          <IconButton
                            label="My Onboarding folder"
                            aria-label={`Open My Onboarding folder for ${item.title}`}
                            href={`/admin/documents?org=${encodeURIComponent(run.organisationId)}&folder=my_onboarding`}
                          >
                            <FolderOpen size={15} strokeWidth={1.75} />
                          </IconButton>
                        ) : null}
                        {item.signatureRequestId ? (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => setEsignId(item.signatureRequestId)}
                          >
                            <PenLine size={14} strokeWidth={1.75} aria-hidden />
                            Open signature
                          </button>
                        ) : item.requiresSignature &&
                          item.clientDocumentId &&
                          run.status === "in_progress" ? (
                          <IconButton
                            label="Manual request"
                            aria-label={`Request signature for ${item.title}`}
                            onClick={() => requestSignature(item)}
                          >
                            <FileSignature size={15} strokeWidth={1.75} />
                          </IconButton>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="grid-2" style={{ marginTop: 16 }}>
            <section className="panel form-compact">
              <h2>3. Direct Debit link</h2>
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
                className="btn btn-primary btn-sm"
                disabled={busy || run.status !== "in_progress" || !ddUrl.trim()}
                onClick={() => savePayment("direct_debit", ddUrl.trim())}
              >
                Save Direct Debit link
              </button>
            </section>
            <section className="panel form-compact">
              <h2>4. Initial payment link</h2>
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
                className="btn btn-primary btn-sm"
                disabled={busy || run.status !== "in_progress" || !payUrl.trim()}
                onClick={() => savePayment("initial_payment", payUrl.trim())}
              >
                Save payment link
              </button>
            </section>
          </div>

          <section className="panel" style={{ marginTop: 16 }}>
            <h2>5. Mark Complete</h2>
            <p className="lead">
              Admin only. Company becomes a full DM.HR client when the Welcome pack (email + pack
              signatures), and both payment links are done.
            </p>
            {!canComplete && blockReason ? (
              <p className="org-meta">{blockReason}</p>
            ) : null}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || !canComplete || run.status !== "in_progress"}
              onClick={markComplete}
            >
              Mark onboarding complete
            </button>
          </section>
        </>
      ) : null}

      {esignId ? (
        <EsignSheet
          requestId={esignId}
          role="admin"
          onClose={() => {
            setEsignId(null);
            void load();
          }}
          onChanged={() => {
            void load();
          }}
        />
      ) : null}

      <FilePreviewSheet target={preview} onClose={() => setPreview(null)} />
    </AppShell>
  );
}

export default function AdminOnboardingDetailPage() {
  return (
    <Suspense
      fallback={
        <main className="auth-shell">
          <p className="lead">Loading onboarding…</p>
        </main>
      }
    >
      <AdminOnboardingDetailInner />
    </Suspense>
  );
}
