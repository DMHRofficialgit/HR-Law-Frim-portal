"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
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
  JOURNEY_ROLE_LABELS,
  onboardingRunBadgeTone,
  onboardingRunLabel,
  packAwaitingAdminReview,
  packItemLabel,
  packJourneyRole,
  packPreviewShowsUnsignedSource,
  packPreviewTarget,
  packProgress,
  paymentUrl,
  type JourneyRole,
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
  journeyRole?: JourneyRole | string;
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

  async function sendWelcome(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
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
        toastError(result.error.message);
        return;
      }
      toastSuccess("Welcome email sent.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function issuePack() {
    if (!selectedLib.length) {
      const msg = "Select at least one Firm Library document.";
      setError(msg);
      toastError(msg);
      return;
    }
    setBusy(true);
    setError("");
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
        toastError(result.error.message);
        return;
      }
      toastSuccess("Pack issued to My Onboarding.");
      setSelectedLib([]);
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
  const issuedRoles = new Set((run?.packItems || []).map((p) => packJourneyRole(p)));

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
                  className="btn btn-primary btn-sm"
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
                countersign is already applied from Firm Library. Tag each template’s onboarding
                stage in Firm Library (Terms / Welcome / Compliance).
              </p>
              {!issuedRoles.has("welcome") || !issuedRoles.has("compliance") ? (
                <p className="org-meta" style={{ marginBottom: 10 }}>
                  {!issuedRoles.has("welcome")
                    ? "No Welcome pack issued yet — tag a Firm Library template as Welcome pack, then issue. "
                    : ""}
                  {!issuedRoles.has("compliance")
                    ? "No Compliance documents issued yet — tag a template as Compliance, then issue."
                    : ""}
                </p>
              ) : null}
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
                    const roleKey = (String(doc.journeyRole || "other").toLowerCase() ||
                      "other") as JourneyRole;
                    const roleLabel =
                      JOURNEY_ROLE_LABELS[roleKey] || JOURNEY_ROLE_LABELS.other;
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
                              {roleLabel}
                              {" · "}
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
                className="btn btn-primary btn-sm"
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
                {run.packItems.map((item) => {
                  const awaitingReview = packAwaitingAdminReview(item);
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
                        <div className="org-name">{item.title}</div>
                        <div className="org-meta">
                          {item.requiresSignature
                            ? packItemLabel(item.status)
                            : "No signature · Done when issued"}
                          {item.signatureRequest
                            ? ` · e-sign: ${item.signatureRequest.status.replace(/_/g, " ")}`
                            : ""}
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
                className="btn btn-primary btn-sm"
                disabled={busy || run.status !== "in_progress" || !ddUrl.trim()}
                onClick={() => savePayment("direct_debit", ddUrl.trim())}
              >
                Save Direct Debit link
              </button>
            </section>
            <section className="panel form-compact">
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
                className="btn btn-primary btn-sm"
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
