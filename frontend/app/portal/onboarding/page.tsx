"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { EsignSheet } from "../../../components/EsignSheet";
import { FilePreviewSheet, type FilePreviewTarget } from "../../../components/FilePreviewSheet";
import { OnboardingStageList } from "../../../components/OnboardingStageList";
import { PanelSkeleton } from "../../../components/Skeleton";
import { useToast } from "../../../context/ToastContext";
import { API_URL, apiFetch, type PublicUser } from "../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import { clientNav } from "../../../lib/nav";
import {
  onboardingOrgLabel,
  onboardingRunBadgeTone,
  onboardingRunLabel,
  packAwaitingAdminReview,
  packItemDone,
  packItemLabel,
  packPreviewDoc,
  paymentUrl,
  type OnboardingPackItem,
  type OnboardingRun,
} from "../../../lib/onboarding";

export default function ClientOnboardingPage() {
  const router = useRouter();
  const { error: toastError } = useToast();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [run, setRun] = useState<OnboardingRun | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgStatus, setOrgStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [esignId, setEsignId] = useState<string | null>(null);
  const [preview, setPreview] = useState<FilePreviewTarget | null>(null);

  function openPackPreview(item: OnboardingPackItem) {
    const doc = packPreviewDoc(item);
    if (!doc) return;
    setPreview({
      title: doc.title,
      url: `${API_URL}/client/documents/${doc.id}/download`,
      fileName: `${doc.title}.pdf`,
      mimeType: "application/pdf",
    });
  }

  const load = useCallback(
    async (token: string | null) => {
      setLoading(true);
      const result = await apiFetch<{
        organisation: { id: string; name: string; onboardingStatus: string };
        run: OnboardingRun | null;
        skipped: boolean;
      }>("/client/onboarding", { token });
      if (!result.success) {
        setError(result.error.message);
        toastError(result.error.message);
        setLoading(false);
        return;
      }
      setError("");
      setOrgName(result.data.organisation.name);
      setOrgStatus(result.data.organisation.onboardingStatus);
      setSkipped(result.data.skipped);
      setRun(result.data.run);
      setLoading(false);
    },
    [toastError]
  );

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "client") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
    void load(token);
  }, [router, load]);

  if (!user) return null;

  if (skipped || orgStatus === "existing_skip") {
    return (
      <AppShell user={user} nav={clientNav} title="My Onboarding">
        <section className="panel">
          <h2>{orgName || "Your organisation"}</h2>
          <p className="lead">
            You are already set up as a DM.HR client. Ongoing documents live in your six document
            folders — there is no one-time onboarding pack for this company.
          </p>
          <Link href="/portal/documents" className="btn btn-primary btn-sm">
            Open documents
          </Link>
        </section>
      </AppShell>
    );
  }

  const dd = run ? paymentUrl(run, "direct_debit") : "";
  const pay = run ? paymentUrl(run, "initial_payment") : "";

  return (
    <AppShell user={user} nav={clientNav} title="My Onboarding">
      {error ? <div className="error-banner">{error}</div> : null}

      {loading && !run ? (
        <div className="panel">
          <PanelSkeleton lines={6} />
        </div>
      ) : null}

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="profile-hub-head" style={{ marginBottom: 0, padding: 0 }}>
          <div className="profile-hub-head-main">
            <div className="profile-hub-titles">
              <h1 style={{ fontSize: "1.15rem" }}>Client onboarding checklist</h1>
              <div className="profile-hub-meta">
                {orgName} · {onboardingOrgLabel(orgStatus)}
                {run ? (
                  <span
                    className={`status-pill status-pill-${onboardingRunBadgeTone(run.status)}`}
                  >
                    {onboardingRunLabel(run.status)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {!run && !loading ? (
          <p className="org-meta" style={{ marginTop: 16 }}>
            DM.HR has not started your onboarding pack yet. You can still use Documents, Cases, and
            other portal areas.
          </p>
        ) : null}

        {run ? <OnboardingStageList run={run} className="onb-stage-block--in-panel" /> : null}
      </section>

      {run ? (
        <>
          <section className="panel" style={{ marginBottom: 16 }}>
            <h2>Documents in My Onboarding</h2>
            <p className="lead">
              Pack files live in your My Onboarding folder. Sign online when DM.HR has sent a
              signature request.
            </p>
            {run.packItems.length === 0 ? (
              <p className="org-meta">No pack documents yet — waiting for DM.HR to issue them.</p>
            ) : (
              <ul className="org-list">
                {run.packItems.map((item) => {
                  const needsSign =
                    item.requiresSignature &&
                    !packItemDone(item) &&
                    item.signatureRequest &&
                    (item.signatureRequest.status === "awaiting_signature" ||
                      item.signatureRequest.status === "revision_requested" ||
                      item.signatureRequest.status === "ready_for_send" ||
                      item.signatureRequest.status === "sent");
                  const awaitingReview = packAwaitingAdminReview(item);
                  const canPreview = Boolean(packPreviewDoc(item));
                  return (
                    <li key={item.id}>
                      <div>
                        <div className="org-name">{item.title}</div>
                        <div className="org-meta">
                          {item.requiresSignature
                            ? packItemLabel(item.status)
                            : "For your records"}
                        </div>
                        {awaitingReview ? (
                          <div className="org-meta" style={{ marginTop: 4 }}>
                            Signed — waiting for DM.HR to mark complete. The Signed copy appears in
                            My Onboarding after review.
                          </div>
                        ) : null}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {needsSign && item.signatureRequestId ? (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => setEsignId(item.signatureRequestId)}
                          >
                            Sign now
                          </button>
                        ) : null}
                        {canPreview ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => openPackPreview(item)}
                          >
                            Preview
                          </button>
                        ) : null}
                        <Link
                          href="/portal/documents?folder=my_onboarding"
                          className="btn btn-secondary btn-sm"
                        >
                          Open folder
                        </Link>
                        <Link href="/portal/signatures" className="btn btn-secondary btn-sm">
                          Signatures
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="panel" style={{ marginBottom: 16 }}>
            <h2>Payment links</h2>
            <p className="lead">Complete Direct Debit and initial payment when links appear.</p>
            <ul className="org-list">
              <li>
                <div>
                  <div className="org-name">Direct Debit setup</div>
                  <div className="org-meta">{dd ? "Link ready" : "Waiting for DM.HR"}</div>
                </div>
                {dd ? (
                  <a
                    href={dd}
                    className="btn btn-primary btn-sm"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open link
                  </a>
                ) : null}
              </li>
              <li>
                <div>
                  <div className="org-name">Initial payment</div>
                  <div className="org-meta">{pay ? "Link ready" : "Waiting for DM.HR"}</div>
                </div>
                {pay ? (
                  <a
                    href={pay}
                    className="btn btn-primary btn-sm"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open link
                  </a>
                ) : null}
              </li>
            </ul>
          </section>
        </>
      ) : null}

      {esignId ? (
        <EsignSheet
          requestId={esignId}
          role="client"
          onClose={() => {
            setEsignId(null);
            void load(getToken());
          }}
          onChanged={() => void load(getToken())}
        />
      ) : null}

      <FilePreviewSheet target={preview} onClose={() => setPreview(null)} />
    </AppShell>
  );
}
