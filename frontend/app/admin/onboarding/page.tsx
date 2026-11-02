"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { PortalSelect } from "../../../components/PortalSelect";
import { MetricSkeleton, TableSkeleton } from "../../../components/Skeleton";
import { apiFetch, type PublicUser } from "../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import { adminNav } from "../../../lib/nav";
import {
  onboardingOrgLabel,
  onboardingRunLabel,
  packProgress,
  termsStatus,
  type OnboardingRun,
} from "../../../lib/onboarding";

type OrgRow = {
  id: string;
  name: string;
  ref: string | null;
  onboardingStatus: string;
};

export default function AdminOnboardingPage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [runs, setRuns] = useState<OnboardingRun[]>([]);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [startOrgId, setStartOrgId] = useState("");
  const [starting, setStarting] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load(token: string | null) {
    setLoading(true);
    const [runsRes, orgsRes] = await Promise.all([
      apiFetch<{ runs: OnboardingRun[] }>("/admin/onboarding/runs", { token }),
      apiFetch<{ organisations: OrgRow[] }>("/admin/organisations", { token }),
    ]);
    if (runsRes.success) setRuns(runsRes.data.runs);
    else setError(runsRes.error.message);
    if (orgsRes.success) setOrgs(orgsRes.data.organisations);
    setLoading(false);
  }

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "admin") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
    load(token);
  }, [router]);

  const activeOrgIds = useMemo(
    () => new Set(runs.filter((r) => r.status === "in_progress").map((r) => r.organisationId)),
    [runs]
  );

  const startableOrgs = useMemo(
    () =>
      orgs.filter(
        (o) => o.onboardingStatus === "in_progress" && !activeOrgIds.has(o.id)
      ),
    [orgs, activeOrgIds]
  );

  const metrics = useMemo(() => {
    const notStarted = startableOrgs.length;
    const inProgress = runs.filter((r) => r.status === "in_progress").length;
    const awaiting = runs.filter(
      (r) =>
        r.status === "in_progress" &&
        r.packItems.some((p) => p.status === "awaiting_signature" || p.status === "issued")
    ).length;
    const completed = runs.filter((r) => r.status === "completed").length;
    return { notStarted, inProgress, awaiting, completed };
  }, [runs, startableOrgs]);

  async function startOnboarding() {
    if (!startOrgId) {
      setError("Select a company to start onboarding.");
      return;
    }
    setError("");
    setNotice("");
    setStarting(true);
    try {
      const result = await apiFetch<{ run: OnboardingRun }>("/admin/onboarding/runs", {
        method: "POST",
        token: getToken(),
        body: JSON.stringify({ organisationId: startOrgId }),
      });
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setNotice(`Onboarding started for ${result.data.run.organisation.name}.`);
      setStartOrgId("");
      router.push(`/admin/onboarding/${result.data.run.id}`);
    } catch {
      setError("Unable to start onboarding.");
    } finally {
      setStarting(false);
    }
  }

  if (!user) return null;

  return (
    <AppShell user={user} nav={adminNav} title="Onboarding">
      {error ? <div className="error-banner">{error}</div> : null}
      {notice ? <div className="success-banner">{notice}</div> : null}

      {loading ? (
        <MetricSkeleton count={4} />
      ) : (
        <div className="metrics-row">
          <div className="metric-card">
            <div className="metric-value">{metrics.notStarted}</div>
            <div className="metric-label">Not started</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{metrics.inProgress}</div>
            <div className="metric-label">In progress</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{metrics.awaiting}</div>
            <div className="metric-label">Awaiting client</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{metrics.completed}</div>
            <div className="metric-label">Completed</div>
          </div>
        </div>
      )}

      <section className="panel" style={{ marginBottom: 20 }}>
        <h2>Start onboarding</h2>
        <p className="lead">
          For companies marked Needs onboarding. Send welcome email and issue the Firm Library pack
          on the detail page.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ flex: "1 1 240px", marginBottom: 0 }}>
            <label htmlFor="startOrg">Company</label>
            <PortalSelect
              id="startOrg"
              aria-label="Company"
              value={startOrgId}
              searchable
              placeholder="Select…"
              options={[
                { value: "", label: "Select…" },
                ...startableOrgs.map((o) => ({
                  value: o.id,
                  label: o.ref ? `${o.name} (${o.ref})` : o.name,
                })),
              ]}
              onChange={setStartOrgId}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={startOnboarding}
            disabled={starting || !startOrgId}
          >
            {starting ? "Starting…" : "Start onboarding"}
          </button>
        </div>
        {startableOrgs.length === 0 ? (
          <p className="org-meta" style={{ marginTop: 12 }}>
            No companies waiting to start. Add a company as “Needs onboarding”, or finish an active
            run first.
          </p>
        ) : null}
      </section>

      <section className="panel">
        <h2>Client onboarding</h2>
        <p className="lead">
          Track Terms of Business, pack progress, payment links, and Admin Complete.
        </p>
        {loading ? (
          <TableSkeleton rows={5} cols={7} />
        ) : runs.length === 0 ? (
          <p className="org-meta">No onboarding runs yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Initiated</th>
                  <th>Terms of Business</th>
                  <th>Pack progress</th>
                  <th>Welcome email</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const prog = packProgress(run);
                  return (
                    <tr key={run.id}>
                      <td>
                        <div className="org-name">{run.organisation.name}</div>
                        <div className="org-meta">
                          {onboardingOrgLabel(run.organisation.onboardingStatus)}
                        </div>
                      </td>
                      <td>{new Date(run.startedAt).toLocaleDateString()}</td>
                      <td>{termsStatus(run)}</td>
                      <td>
                        {prog.total === 0 ? "—" : `${prog.done} of ${prog.total}`}
                      </td>
                      <td>{run.welcomeEmailSentAt ? "Sent" : "Not sent"}</td>
                      <td>
                        <span className="status-chip">{onboardingRunLabel(run.status)}</span>
                      </td>
                      <td>
                        <Link
                          href={`/admin/onboarding/${run.id}`}
                          className="btn btn-secondary btn-sm"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
