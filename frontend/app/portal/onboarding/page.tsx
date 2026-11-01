"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { EsignSheet } from "../../../components/EsignSheet";
import { apiFetch, type PublicUser } from "../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import { clientNav } from "../../../lib/nav";
import {
  journeyStages,
  onboardingOrgLabel,
  onboardingRunLabel,
  packItemDone,
  packItemLabel,
  packProgress,
  paymentUrl,
  type OnboardingRun,
} from "../../../lib/onboarding";

export default function ClientOnboardingPage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [run, setRun] = useState<OnboardingRun | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgStatus, setOrgStatus] = useState("");
  const [error, setError] = useState("");
  const [esignId, setEsignId] = useState<string | null>(null);

  async function load(token: string | null) {
    const result = await apiFetch<{
      organisation: { id: string; name: string; onboardingStatus: string };
      run: OnboardingRun | null;
      skipped: boolean;
    }>("/client/onboarding", { token });
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setOrgName(result.data.organisation.name);
    setOrgStatus(result.data.organisation.onboardingStatus);
    setSkipped(result.data.skipped);
    setRun(result.data.run);
  }

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "client") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
    load(token);
  }, [router]);

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
          <Link href="/portal/documents" className="btn btn-primary">
            Open documents
          </Link>
        </section>
      </AppShell>
    );
  }

  const prog = run ? packProgress(run) : { done: 0, total: 0 };
  const stages = run ? journeyStages(run) : [];
  const dd = run ? paymentUrl(run, "direct_debit") : "";
  const pay = run ? paymentUrl(run, "initial_payment") : "";
  const stageDone = stages.filter((s) => s.done).length;

  return (
    <AppShell user={user} nav={clientNav} title="My Onboarding">
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="row-between">
          <div>
            <h2>Client onboarding checklist</h2>
            <p className="lead" style={{ marginBottom: 0 }}>
              {orgName} · {onboardingOrgLabel(orgStatus)}
              {run ? ` · ${onboardingRunLabel(run.status)}` : ""}
            </p>
          </div>
          {run ? <span className="status-chip">{onboardingRunLabel(run.status)}</span> : null}
        </div>

        {!run ? (
          <p className="org-meta" style={{ marginTop: 16 }}>
            DM.HR has not started your onboarding pack yet. You can still use Documents, Cases, and
            other portal areas.
          </p>
        ) : (
          <>
            <div className="row-top" style={{ marginTop: 16 }}>
              <strong>Overall progress</strong>
              <strong>
                {stageDone} of {stages.length} stages · pack {prog.done}/{prog.total || 0}
              </strong>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${stages.length ? (stageDone / stages.length) * 100 : 0}%`,
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
          </>
        )}
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
                  return (
                    <li key={item.id}>
                      <div>
                        <div className="org-name">{item.title}</div>
                        <div className="org-meta">
                          {item.requiresSignature
                            ? packItemLabel(item.status)
                            : "For your records"}
                        </div>
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
            load(getToken());
          }}
          onChanged={() => load(getToken())}
        />
      ) : null}
    </AppShell>
  );
}
