"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Building2,
  ClipboardCheck,
  FileSignature,
  FolderOpen,
  PenLine,
  Plus,
  UserPlus,
} from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { OverviewActivityList } from "../../components/OverviewActivityList";
import { ListSkeleton, MetricSkeleton } from "../../components/Skeleton";
import { apiFetch, type PublicUser } from "../../lib/api";
import { clearSession, getStoredUser, getToken, homeForUser } from "../../lib/auth";
import { caseBadgeTone, statusLabel } from "../../lib/cases";
import { adminNav } from "../../lib/nav";
import type { PortalNotification } from "../../lib/notifications";
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
  const [activity, setActivity] = useState<PortalNotification[]>([]);
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
        const [orgsRes, casesRes, runsRes, sigRes, notifyRes] = await Promise.all([
          apiFetch<{ organisations: OrgRow[] }>("/admin/organisations", { token }),
          apiFetch<{ cases: CaseRow[] }>("/admin/cases", { token }),
          apiFetch<{ runs: OnboardingRun[] }>("/admin/onboarding/runs", { token }),
          apiFetch<{ requests: SignatureRequestRow[] }>("/admin/signature-requests", {
            token,
          }),
          apiFetch<{ notifications: PortalNotification[] }>("/notifications", {
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
        if (notifyRes.success) setActivity(notifyRes.data.notifications);
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
    <AppShell
      user={user}
      nav={adminNav}
      title="Overview"
      actions={
        <Link href="/admin/organisations#add-organisation" className="btn btn-primary btn-sm">
          <Plus size={14} strokeWidth={1.75} aria-hidden />
          Add client
        </Link>
      }
    >
      {error ? <div className="error-banner">{error}</div> : null}

      <p className="lead overview-intro" style={{ marginTop: 0, marginBottom: 16 }}>
        Client activity, onboarding, and employment cases at a glance.
      </p>

      {loading ? (
        <MetricSkeleton count={4} />
      ) : (
        <div className="metrics-row case-metrics-row" role="group" aria-label="Portfolio summary">
          <Link
            href="/admin/organisations"
            className="metric-card metric-card-link case-metric-card"
          >
            <Building2 className="case-metric-icon" size={16} strokeWidth={1.75} aria-hidden />
            <div className="metric-value">{metrics.clientsCount}</div>
            <div className="metric-label">Active clients</div>
            <p className="metric-hint">Across your client portfolio</p>
          </Link>
          <Link
            href="/admin/cases?open=1"
            className="metric-card metric-card-link case-metric-card"
          >
            <Briefcase className="case-metric-icon" size={16} strokeWidth={1.75} aria-hidden />
            <div className="metric-value">{metrics.openCases}</div>
            <div className="metric-label">Open employment cases</div>
            <p className="metric-hint">Received and in progress</p>
          </Link>
          <Link
            href="/admin/onboarding"
            className="metric-card metric-card-link case-metric-card"
          >
            <ClipboardCheck
              className="case-metric-icon"
              size={16}
              strokeWidth={1.75}
              aria-hidden
            />
            <div className="metric-value">{metrics.onboardingInProgress}</div>
            <div className="metric-label">Onboarding in progress</div>
            <p className="metric-hint">New-client pack journeys</p>
          </Link>
          <Link
            href="/admin/signatures"
            className="metric-card metric-card-link case-metric-card"
          >
            <PenLine className="case-metric-icon" size={16} strokeWidth={1.75} aria-hidden />
            <div className="metric-value">{metrics.awaitingClient}</div>
            <div className="metric-label">Awaiting client response</div>
            <p className="metric-hint">Cases and signatures needing follow-up</p>
          </Link>
        </div>
      )}

      <div className="overview-dash-grid">
        <section className="panel overview-dash-panel">
          <div className="row-between" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Cases requiring attention</h2>
            <Link href="/admin/cases" className="btn btn-secondary btn-sm">
              View all
            </Link>
          </div>
          <div className="overview-dash-scroll dmhr-scroll">
            {loading ? (
              <ListSkeleton rows={3} showAvatar={false} />
            ) : attentionCases.length === 0 ? (
              <p className="lead" style={{ margin: 0 }}>
                No cases need attention right now.{" "}
                <Link href="/admin/cases?create=1">Create a case</Link>
              </p>
            ) : (
              <ul className="overview-attn-list">
                {attentionCases.map((c) => (
                  <li key={c.id} className="overview-attn-row">
                    <div className="overview-attn-main">
                      <div className="overview-attn-title">
                        <strong>{c.ref}</strong>
                        <span
                          className={`status-pill status-pill-${caseBadgeTone(c.status)}`}
                        >
                          {statusLabel(c.status)}
                        </span>
                      </div>
                      <div className="overview-attn-meta">
                        {c.organisation.name} · {c.title}
                      </div>
                    </div>
                    <Link href={`/admin/cases/${c.id}`} className="btn btn-primary btn-sm">
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="panel overview-dash-panel">
          <div className="row-between" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Recent activity</h2>
            <Link href="/admin/notifications" className="btn btn-secondary btn-sm">
              View all
            </Link>
          </div>
          <div className="overview-dash-scroll dmhr-scroll">
            <OverviewActivityList
              items={activity}
              loading={loading}
              emptyLabel="No recent notifications. Activity will appear as cases, packs, and signatures move."
            />
          </div>
        </section>

        <section className="panel overview-dash-panel">
          <div className="row-between" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Onboarding in progress</h2>
            <Link href="/admin/onboarding" className="btn btn-secondary btn-sm">
              View all
            </Link>
          </div>
          <div className="overview-dash-scroll dmhr-scroll">
            {loading ? (
              <ListSkeleton rows={3} showAvatar={false} />
            ) : activeOnboarding.length === 0 ? (
              <p className="lead" style={{ margin: 0 }}>
                No active onboarding runs.{" "}
                <Link href="/admin/onboarding">Start onboarding</Link>
              </p>
            ) : (
              <ul className="overview-progress-list">
                {activeOnboarding.map((run) => {
                  const progress = packProgress(run);
                  const pct =
                    progress.total > 0
                      ? Math.round((progress.done / progress.total) * 100)
                      : 0;
                  return (
                    <li key={run.id} className="overview-progress-row">
                      <div className="overview-progress-head">
                        <div>
                          <div className="overview-attn-title">
                            <strong>{run.organisation.name}</strong>
                          </div>
                          <div className="overview-attn-meta">
                            {onboardingRunLabel(run.status)} · Pack {progress.done}/
                            {progress.total}
                          </div>
                        </div>
                        <Link
                          href={`/admin/onboarding/${run.id}`}
                          className="btn btn-primary btn-sm"
                        >
                          Open
                        </Link>
                      </div>
                      <div
                        className="overview-progress-track"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Pack progress ${progress.done} of ${progress.total}`}
                      >
                        <span
                          className="overview-progress-fill"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="panel overview-dash-panel">
          <div style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Quick actions</h2>
            <p className="lead" style={{ margin: "6px 0 0" }}>
              Jump into the most common admin workflows.
            </p>
          </div>
          <div className="overview-quick-grid overview-actions-grid">
            <Link
              href="/admin/organisations#add-organisation"
              className="overview-quick-tile overview-action-tile"
            >
              <UserPlus size={18} strokeWidth={1.75} aria-hidden />
              <strong>Add client</strong>
              <span>Create a company workspace</span>
            </Link>
            <Link href="/admin/onboarding" className="overview-quick-tile overview-action-tile">
              <ClipboardCheck size={18} strokeWidth={1.75} aria-hidden />
              <strong>Start onboarding</strong>
              <span>Prepare a Welcome pack journey</span>
            </Link>
            <Link
              href="/admin/cases?create=1"
              className="overview-quick-tile overview-action-tile"
            >
              <Briefcase size={18} strokeWidth={1.75} aria-hidden />
              <strong>Create case</strong>
              <span>Log an employment matter</span>
            </Link>
            <Link href="/admin/signatures" className="overview-quick-tile overview-action-tile">
              <FileSignature size={18} strokeWidth={1.75} aria-hidden />
              <strong>Signatures</strong>
              <span>Queue awaiting and revisions</span>
            </Link>
            <Link
              href="/admin/firm-library/onboarding"
              className="overview-quick-tile overview-action-tile"
            >
              <FolderOpen size={18} strokeWidth={1.75} aria-hidden />
              <strong>Firm Library</strong>
              <span>Pack templates and firm staging</span>
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
