"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { ListSkeleton, MetricSkeleton } from "../../components/Skeleton";
import { apiFetch, type PublicUser } from "../../lib/api";
import { clearSession, getStoredUser, getToken, homeForUser } from "../../lib/auth";
import { statusLabel } from "../../lib/cases";
import { adminNav } from "../../lib/nav";
import {
  onboardingRunLabel,
  packProgress,
  type OnboardingRun,
} from "../../lib/onboarding";
import {
  isActiveSignatureStatus,
  type SignatureRequestRow,
} from "../../lib/signatures";

type OrgRow = {
  id: string;
  name: string;
  ref: string | null;
  onboardingStatus: string;
  status: string;
};

type CaseRow = {
  id: string;
  ref: string;
  title: string;
  status: string;
  updatedAt: string;
  organisation: { id: string; name: string };
};

export default function AdminOverviewPage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [runs, setRuns] = useState<OnboardingRun[]>([]);
  const [signatures, setSignatures] = useState<SignatureRequestRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored) {
      router.replace("/login");
      return;
    }
    if (stored.role !== "admin") {
      router.replace(homeForUser(stored));
      return;
    }
    if (stored.mustChangePassword) {
      router.replace("/change-password");
      return;
    }
    setUser(stored);

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [orgsRes, casesRes, runsRes, sigRes] = await Promise.all([
          apiFetch<{ organisations: OrgRow[] }>("/admin/organisations", { token }),
          apiFetch<{ cases: CaseRow[] }>("/admin/cases", { token }),
          apiFetch<{ runs: OnboardingRun[] }>("/admin/onboarding/runs", { token }),
          apiFetch<{ requests: SignatureRequestRow[] }>("/admin/signature-requests", {
            token,
          }),
        ]);

        if (!orgsRes.success) {
          if (orgsRes.error.code === "PASSWORD_CHANGE_REQUIRED") {
            router.replace("/change-password");
            return;
          }
          if (orgsRes.error.code === "UNAUTHORIZED" || orgsRes.error.code === "FORBIDDEN") {
            clearSession();
            router.replace("/login");
            return;
          }
          setError(orgsRes.error.message);
        } else {
          setOrgs(orgsRes.data.organisations);
        }

        if (casesRes.success) setCases(casesRes.data.cases);
        if (runsRes.success) setRuns(runsRes.data.runs);
        if (sigRes.success) setSignatures(sigRes.data.requests);
      } catch {
        setError("Unable to load overview.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [router]);

  const openCases = useMemo(
    () => cases.filter((c) => c.status !== "closed"),
    [cases]
  );

  const attentionCases = useMemo(
    () =>
      openCases
        .filter((c) =>
          ["submitted", "information_required", "allocated"].includes(c.status)
        )
        .slice(0, 5),
    [openCases]
  );

  const activeOnboarding = useMemo(
    () => runs.filter((r) => r.status === "in_progress").slice(0, 5),
    [runs]
  );

  const awaitingSignatures = useMemo(
    () =>
      signatures.filter(
        (s) =>
          isActiveSignatureStatus(s.status) &&
          (s.status === "awaiting_signature" || s.status === "revision_requested")
      ).length,
    [signatures]
  );

  const metrics = useMemo(() => {
    const clientsCount = orgs.filter((o) => o.status.toLowerCase() === "active").length;
    const onboardingInProgress =
      runs.filter((r) => r.status === "in_progress").length ||
      orgs.filter((o) => o.onboardingStatus === "in_progress").length;
    const awaitingClient =
      openCases.filter((c) => c.status === "information_required").length +
      awaitingSignatures;

    return {
      clientsCount,
      openCases: openCases.length,
      onboardingInProgress,
      awaitingClient,
    };
  }, [orgs, openCases, runs, awaitingSignatures]);

  if (!user) return null;

  return (
    <AppShell user={user} nav={adminNav} title="Overview">
      {error ? <div className="error-banner">{error}</div> : null}

      <p className="lead overview-intro" style={{ marginTop: 0, marginBottom: 16 }}>
        Client activity, onboarding, and employment cases at a glance.{" "}
        <Link href="/admin/organisations">Manage organisations</Link>
        {" · "}
        <Link href="/admin/organisations#add-organisation">Add a client</Link>
      </p>

      {loading ? (
        <MetricSkeleton count={4} />
      ) : (
        <div className="metrics-row">
          <div className="metric-card">
            <div className="metric-value">{metrics.clientsCount}</div>
            <div className="metric-label">Active clients</div>
            <p className="metric-hint">Across your client portfolio</p>
          </div>
          <div className="metric-card">
            <div className="metric-value">{metrics.openCases}</div>
            <div className="metric-label">Open employment cases</div>
            <p className="metric-hint">Received and in progress</p>
          </div>
          <div className="metric-card">
            <div className="metric-value">{metrics.onboardingInProgress}</div>
            <div className="metric-label">Onboarding in progress</div>
            <p className="metric-hint">New-client pack journeys</p>
          </div>
          <div className="metric-card">
            <div className="metric-value">{metrics.awaitingClient}</div>
            <div className="metric-label">Awaiting client response</div>
            <p className="metric-hint">Cases and signatures needing follow-up</p>
          </div>
        </div>
      )}

      <div className="grid-2">
        <section className="panel">
          <div className="row-between" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Cases requiring attention</h2>
            <Link href="/admin/cases" className="btn btn-secondary btn-sm">
              View all
            </Link>
          </div>
          {loading ? (
            <ListSkeleton rows={3} showAvatar={false} />
          ) : attentionCases.length === 0 ? (
            <p className="lead" style={{ margin: 0 }}>
              No cases need attention right now.
            </p>
          ) : (
            <ul className="org-list overview-list">
              {attentionCases.map((c) => (
                <li key={c.id}>
                  <div>
                    <div className="org-name">{c.ref}</div>
                    <div className="org-meta">
                      {c.organisation.name} · {c.title} · {statusLabel(c.status)}
                    </div>
                  </div>
                  <Link
                    href={`/admin/cases/${c.id}`}
                    className="btn btn-primary btn-sm"
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="row-between" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Onboarding in progress</h2>
            <Link href="/admin/onboarding" className="btn btn-secondary btn-sm">
              View all
            </Link>
          </div>
          {loading ? (
            <ListSkeleton rows={3} showAvatar={false} />
          ) : activeOnboarding.length === 0 ? (
            <p className="lead" style={{ margin: 0 }}>
              No active onboarding runs.{" "}
              <Link href="/admin/organisations#add-organisation">Add a client</Link> or start a
              run from Onboarding.
            </p>
          ) : (
            <ul className="org-list overview-list">
              {activeOnboarding.map((run) => {
                const progress = packProgress(run);
                return (
                  <li key={run.id}>
                    <div>
                      <div className="org-name">{run.organisation.name}</div>
                      <div className="org-meta">
                        {onboardingRunLabel(run.status)} · Pack {progress.done}/{progress.total}
                      </div>
                    </div>
                    <Link
                      href={`/admin/onboarding/${run.id}`}
                      className="btn btn-primary btn-sm"
                    >
                      Open
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="row-between" style={{ marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>Quick links</h2>
            <p className="lead" style={{ margin: "6px 0 0" }}>
              Jump into the most common admin workflows.
            </p>
          </div>
        </div>
        <div className="overview-quick-grid">
          <Link href="/admin/organisations" className="overview-quick-tile">
            <strong>Organisations</strong>
            <span>Client directory and add company</span>
          </Link>
          <Link href="/admin/firm-library" className="overview-quick-tile">
            <strong>Firm Library</strong>
            <span>Templates and onboarding pack</span>
          </Link>
          <Link href="/admin/signatures" className="overview-quick-tile">
            <strong>Signatures</strong>
            <span>Queue awaiting and revisions</span>
          </Link>
          <Link href="/admin/documents" className="overview-quick-tile">
            <strong>Documents</strong>
            <span>Client folders and Private Space</span>
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
