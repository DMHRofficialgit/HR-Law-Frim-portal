"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  ClipboardCheck,
  FileSignature,
  FolderOpen,
  Plus,
} from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { OverviewActivityList } from "../../components/OverviewActivityList";
import { ListSkeleton, MetricSkeleton } from "../../components/Skeleton";
import { apiFetch, type PublicUser } from "../../lib/api";
import { clearSession, getStoredUser, getToken, homeForUser } from "../../lib/auth";
import { caseBadgeTone, statusLabel } from "../../lib/cases";
import { clientNav } from "../../lib/nav";
import type { PortalNotification } from "../../lib/notifications";
import {
  onboardingRunLabel,
  packProgress,
  type OnboardingRun,
} from "../../lib/onboarding";
import {
  isAwaitingSignatureStatus,
  type SignatureRequestRow,
} from "../../lib/signatures";

type Organisation = {
  id: string;
  name: string;
  ref: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  type: string | null;
  onboardingStatus: string;
  status: string;
};

type CaseRow = {
  id: string;
  ref: string;
  title: string;
  status: string;
};

type DocFolder = {
  id: string;
  name: string;
};

export default function PortalHomePage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [org, setOrg] = useState<Organisation | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [folderCount, setFolderCount] = useState(0);
  const [signatures, setSignatures] = useState<SignatureRequestRow[]>([]);
  const [run, setRun] = useState<OnboardingRun | null>(null);
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
    if (stored.role !== "client") {
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
      try {
        const [orgRes, casesRes, docsRes, sigRes, runRes, notifyRes] =
          await Promise.all([
            apiFetch<{ organisation: Organisation }>("/client/organisation", {
              token,
            }),
            apiFetch<{ cases: CaseRow[] }>("/client/cases", { token }),
            apiFetch<{ folders: DocFolder[] }>("/client/folders", { token }),
            apiFetch<{ requests: SignatureRequestRow[] }>(
              "/client/signature-requests",
              { token }
            ),
            apiFetch<{
              organisation: { id: string; name: string; onboardingStatus: string };
              run: OnboardingRun | null;
              skipped: boolean;
            }>("/client/onboarding", { token }),
            apiFetch<{ notifications: PortalNotification[] }>("/notifications", {
              token,
            }),
          ]);

        if (!orgRes.success) {
          if (orgRes.error.code === "PASSWORD_CHANGE_REQUIRED") {
            router.replace("/change-password");
            return;
          }
          if (
            orgRes.error.code === "UNAUTHORIZED" ||
            orgRes.error.code === "FORBIDDEN"
          ) {
            clearSession();
            router.replace("/login");
            return;
          }
          setError(orgRes.error.message);
          return;
        }
        setOrg(orgRes.data.organisation);
        setError("");

        if (casesRes.success) setCases(casesRes.data.cases);
        if (docsRes.success) setFolderCount(docsRes.data.folders.length);
        if (sigRes.success) setSignatures(sigRes.data.requests);
        if (runRes.success) setRun(runRes.data.run);
        if (notifyRes.success) setActivity(notifyRes.data.notifications);
      } catch {
        setError("Unable to load your organisation.");
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

  const signaturesWaiting = useMemo(
    () => signatures.filter((s) => isAwaitingSignatureStatus(s.status)).length,
    [signatures]
  );

  const onboardingActive =
    org?.onboardingStatus === "in_progress" || run?.status === "in_progress";

  const pack = run && run.status === "in_progress" ? packProgress(run) : null;
  const packPct =
    pack && pack.total > 0 ? Math.round((pack.done / pack.total) * 100) : 0;

  if (!user) return null;

  return (
    <AppShell
      user={user}
      nav={clientNav}
      title="Overview"
      actions={
        <Link href="/portal/cases?create=1" className="btn btn-primary btn-sm">
          <Plus size={14} strokeWidth={1.75} aria-hidden />
          Submit a case
        </Link>
      }
    >
      {error ? <div className="error-banner">{error}</div> : null}

      <p className="lead overview-intro" style={{ marginTop: 0, marginBottom: 16 }}>
        Welcome back{org?.name ? `, ${org.name}` : ""}. Documents, cases, and onboarding in one
        place.
      </p>

      {loading ? (
        <MetricSkeleton count={4} />
      ) : (
        <div className="metrics-row case-metrics-row" role="group" aria-label="Your summary">
          <Link
            href="/portal/cases"
            className="metric-card metric-card-link case-metric-card"
          >
            <Briefcase className="case-metric-icon" size={16} strokeWidth={1.75} aria-hidden />
            <div className="metric-value">{openCases.length}</div>
            <div className="metric-label">Open cases</div>
            <p className="metric-hint">Track updates and next steps</p>
          </Link>
          <Link
            href="/portal/signatures"
            className="metric-card metric-card-link case-metric-card"
          >
            <FileSignature
              className="case-metric-icon"
              size={16}
              strokeWidth={1.75}
              aria-hidden
            />
            <div className="metric-value">{signaturesWaiting}</div>
            <div className="metric-label">Signatures waiting</div>
            <p className="metric-hint">Items that need your e-sign</p>
          </Link>
          <Link
            href={onboardingActive ? "/portal/onboarding" : "/portal/documents"}
            className="metric-card metric-card-link case-metric-card"
          >
            <ClipboardCheck
              className="case-metric-icon"
              size={16}
              strokeWidth={1.75}
              aria-hidden
            />
            <div className="metric-value metric-value-text">
              {onboardingActive ? "Live" : "Done"}
            </div>
            <div className="metric-label">Onboarding</div>
            <p className="metric-hint">
              {onboardingActive
                ? pack
                  ? `Pack ${pack.done}/${pack.total}`
                  : "One-time pack in progress"
                : "Complete or skipped"}
            </p>
          </Link>
          <Link
            href="/portal/documents"
            className="metric-card metric-card-link case-metric-card"
          >
            <FolderOpen className="case-metric-icon" size={16} strokeWidth={1.75} aria-hidden />
            <div className="metric-value">{folderCount || 7}</div>
            <div className="metric-label">Document spaces</div>
            <p className="metric-hint">Folders in your company workspace</p>
          </Link>
        </div>
      )}

      <div className="overview-dash-grid">
        <section className="panel overview-dash-panel">
          <div className="row-between" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Cases needing attention</h2>
            <Link href="/portal/cases" className="btn btn-secondary btn-sm">
              View all
            </Link>
          </div>
          <div className="overview-dash-scroll dmhr-scroll">
            {loading ? (
              <ListSkeleton rows={3} showAvatar={false} />
            ) : attentionCases.length === 0 ? (
              <p className="lead" style={{ margin: 0 }}>
                No open cases need action.{" "}
                <Link href="/portal/cases?create=1">Submit a case</Link>
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
                      <div className="overview-attn-meta">{c.title}</div>
                    </div>
                    <Link href={`/portal/cases/${c.id}`} className="btn btn-primary btn-sm">
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
            <Link href="/portal/notifications" className="btn btn-secondary btn-sm">
              View all
            </Link>
          </div>
          <div className="overview-dash-scroll dmhr-scroll">
            <OverviewActivityList
              items={activity}
              loading={loading}
              emptyLabel="No recent activity yet. Updates on cases, documents, and signatures will show here."
            />
          </div>
        </section>

        {onboardingActive && run ? (
          <section className="panel overview-dash-panel">
            <div className="row-between" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>My Onboarding</h2>
              <Link href="/portal/onboarding" className="btn btn-primary btn-sm">
                Continue
              </Link>
            </div>
            <div className="overview-progress-row">
              <div className="overview-progress-head">
                <div>
                  <div className="overview-attn-title">
                    <strong>{onboardingRunLabel(run.status)}</strong>
                  </div>
                  <div className="overview-attn-meta">
                    Pack {pack?.done ?? 0}/{pack?.total ?? 0} complete
                  </div>
                </div>
              </div>
              <div
                className="overview-progress-track"
                role="progressbar"
                aria-valuenow={packPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Onboarding pack progress"
              >
                <span
                  className="overview-progress-fill"
                  style={{ width: `${packPct}%` }}
                />
              </div>
            </div>
          </section>
        ) : null}

        <section
          className={`panel overview-dash-panel${onboardingActive && run ? "" : " overview-dash-span"}`}
        >
          <div style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Your workspace</h2>
            <p className="lead" style={{ margin: "6px 0 0" }}>
              Jump into the spaces you use most.
            </p>
          </div>
          <div className="overview-quick-grid overview-actions-grid">
            <Link href="/portal/documents" className="overview-quick-tile overview-action-tile">
              <FolderOpen size={18} strokeWidth={1.75} aria-hidden />
              <strong>Documents</strong>
              <span>Policies, handbook, HR files</span>
            </Link>
            <Link href="/portal/cases" className="overview-quick-tile overview-action-tile">
              <Briefcase size={18} strokeWidth={1.75} aria-hidden />
              <strong>Employment cases</strong>
              <span>Submit and follow progress</span>
            </Link>
            <Link href="/portal/signatures" className="overview-quick-tile overview-action-tile">
              <FileSignature size={18} strokeWidth={1.75} aria-hidden />
              <strong>Signatures</strong>
              <span>Items waiting for your e-sign</span>
            </Link>
            {onboardingActive ? (
              <Link
                href="/portal/onboarding"
                className="overview-quick-tile overview-action-tile"
              >
                <ClipboardCheck size={18} strokeWidth={1.75} aria-hidden />
                <strong>My Onboarding</strong>
                <span>One-time pack with DM.HR</span>
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
