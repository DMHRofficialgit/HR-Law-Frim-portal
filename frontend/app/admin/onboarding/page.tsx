"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Eye,
  FolderOpen,
  Inbox,
} from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { PortalSearch } from "../../../components/PortalSearch";
import { PortalSelect } from "../../../components/PortalSelect";
import { RowActionsMenu } from "../../../components/RowActionsMenu";
import { MetricSkeleton, TableSkeleton } from "../../../components/Skeleton";
import { StartOnboardingDialog } from "../../../components/StartOnboardingDialog";
import { useToast } from "../../../context/ToastContext";
import { apiFetch, type PublicUser } from "../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import { adminNav } from "../../../lib/nav";
import {
  onboardingOrgLabel,
  onboardingRunBadgeTone,
  onboardingRunLabel,
  orgInitialsFromName,
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

type OnbKpiKey = "not_started" | "in_progress" | "awaiting" | "completed";

export default function AdminOnboardingPage() {
  const router = useRouter();
  const { error: toastError, success: toastSuccess } = useToast();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [runs, setRuns] = useState<OnboardingRun[]>([]);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [kpi, setKpi] = useState<OnbKpiKey | "all">("all");
  const [startOpen, setStartOpen] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [runsRes, orgsRes] = await Promise.all([
        apiFetch<{ runs: OnboardingRun[] }>("/admin/onboarding/runs", { token }),
        apiFetch<{ organisations: OrgRow[] }>("/admin/organisations", { token }),
      ]);
      if (runsRes.success) setRuns(runsRes.data.runs);
      else {
        setError(runsRes.error.message);
        toastError(runsRes.error.message);
      }
      if (orgsRes.success) setOrgs(orgsRes.data.organisations);
    } catch {
      setError("Unable to load onboarding.");
      toastError("Unable to load onboarding.");
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "admin") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
    void load();
  }, [router, load]);

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

  const awaitingRunIds = useMemo(() => {
    return new Set(
      runs
        .filter(
          (r) =>
            r.status === "in_progress" &&
            r.packItems.some(
              (p) => p.status === "awaiting_signature" || p.status === "issued"
            )
        )
        .map((r) => r.id)
    );
  }, [runs]);

  const metrics = useMemo(
    () => ({
      not_started: startableOrgs.length,
      in_progress: runs.filter((r) => r.status === "in_progress").length,
      awaiting: awaitingRunIds.size,
      completed: runs.filter((r) => r.status === "completed").length,
    }),
    [runs, startableOrgs, awaitingRunIds]
  );

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return runs.filter((run) => {
      if (statusFilter && run.status !== statusFilter) return false;
      if (kpi === "in_progress" && run.status !== "in_progress") return false;
      if (kpi === "completed" && run.status !== "completed") return false;
      if (kpi === "awaiting" && !awaitingRunIds.has(run.id)) return false;
      if (!needle) return true;
      const hay = [
        run.organisation.name,
        onboardingOrgLabel(run.organisation.onboardingStatus),
        onboardingRunLabel(run.status),
        termsStatus(run),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [runs, filter, statusFilter, kpi, awaitingRunIds]);

  const closeStart = useCallback(() => setStartOpen(false), []);

  const kpiCards: Array<{
    key: OnbKpiKey;
    label: string;
    hint: string;
    icon: typeof CircleDashed;
  }> = [
    {
      key: "not_started",
      label: "Not started",
      hint: "Ready to initiate",
      icon: CircleDashed,
    },
    {
      key: "in_progress",
      label: "In progress",
      hint: "Currently underway",
      icon: Clock3,
    },
    {
      key: "awaiting",
      label: "Awaiting client",
      hint: "Client action required",
      icon: Inbox,
    },
    {
      key: "completed",
      label: "Completed",
      hint: "Onboarding finished",
      icon: CheckCircle2,
    },
  ];

  if (!user) return null;

  return (
    <AppShell user={user} nav={adminNav} title="Onboarding">
      {error ? <div className="error-banner">{error}</div> : null}

      {loading ? (
        <MetricSkeleton count={4} />
      ) : (
        <div
          className="metrics-row case-metrics-row"
          role="group"
          aria-label="Onboarding status summary"
        >
          {kpiCards.map(({ key, label, hint, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={`metric-card metric-card-link case-metric-card${
                kpi === key ? " is-active" : ""
              }`}
              onClick={() => {
                if (key === "not_started") {
                  setStartOpen(true);
                  return;
                }
                setKpi((prev) => (prev === key ? "all" : key));
              }}
              aria-pressed={kpi === key}
            >
              <Icon className="case-metric-icon" size={16} strokeWidth={1.75} aria-hidden />
              <div className="metric-value">{metrics[key]}</div>
              <div className="metric-label">{label}</div>
              <p className="metric-hint">{hint}</p>
            </button>
          ))}
        </div>
      )}

      <section className="panel org-directory">
        <div className="org-directory-head">
          <div>
            <h2>Client onboarding</h2>
            <p className="lead">
              {loading
                ? "…"
                : `${filtered.length} run${filtered.length === 1 ? "" : "s"}`}
              {!loading && runs.length !== filtered.length ? ` · ${runs.length} total` : ""}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setStartOpen(true)}
          >
            + Start onboarding
          </button>
        </div>

        <div className="org-toolbar org-directory-toolbar">
          <div className="org-toolbar-search">
            <PortalSearch
              mode="inline"
              nav={adminNav}
              role="admin"
              value={filter}
              onQueryChange={setFilter}
              placeholder="Search client or status…"
              aria-label="Filter onboarding runs"
            />
          </div>
          <PortalSelect
            className="org-filter"
            size="sm"
            aria-label="Filter by status"
            value={statusFilter}
            options={[
              { value: "", label: "All statuses" },
              { value: "in_progress", label: "In progress" },
              { value: "completed", label: "Completed" },
            ]}
            onChange={setStatusFilter}
          />
        </div>

        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p>
              {runs.length === 0
                ? "No onboarding runs yet."
                : "No runs match these filters."}
            </p>
            <p className="lead">
              Start onboarding for a company marked Needs onboarding.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setStartOpen(true)}
            >
              Start onboarding
            </button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table org-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Initiated</th>
                  <th>Terms of Business</th>
                  <th>Pack progress</th>
                  <th>Welcome email</th>
                  <th>Status</th>
                  <th className="org-table-actions-col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((run) => {
                  const prog = packProgress(run);
                  return (
                    <tr key={run.id}>
                      <td>
                        <div className="org-table-company">
                          <span className="org-table-avatar" aria-hidden>
                            {orgInitialsFromName(run.organisation.name)}
                          </span>
                          <div>
                            <span className="primary-cell">{run.organisation.name}</span>
                            <span className="secondary-cell">
                              {onboardingOrgLabel(run.organisation.onboardingStatus)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="org-table-muted">
                          {new Date(run.startedAt).toLocaleDateString()}
                        </span>
                      </td>
                      <td>
                        <span className="org-table-muted">{termsStatus(run)}</span>
                      </td>
                      <td>
                        <span className="org-table-cases">
                          {prog.total === 0 ? "—" : `${prog.done} of ${prog.total}`}
                        </span>
                      </td>
                      <td>
                        <span className="org-table-muted">
                          {run.welcomeEmailSentAt ? "Sent" : "Not sent"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`status-pill status-pill-${onboardingRunBadgeTone(run.status)}`}
                        >
                          {onboardingRunLabel(run.status)}
                        </span>
                      </td>
                      <td className="org-table-actions-col">
                        <RowActionsMenu
                          label={`Actions for ${run.organisation.name}`}
                          items={[
                            {
                              id: "open",
                              label: "Open",
                              icon: <Eye size={14} strokeWidth={1.75} />,
                              onSelect: () =>
                                router.push(`/admin/onboarding/${run.id}`),
                            },
                            {
                              id: "client",
                              label: "Open client",
                              icon: <Building2 size={14} strokeWidth={1.75} />,
                              onSelect: () =>
                                router.push(
                                  `/admin/organisations/${run.organisationId}`
                                ),
                            },
                            {
                              id: "docs",
                              label: "My Onboarding folder",
                              icon: <FolderOpen size={14} strokeWidth={1.75} />,
                              onSelect: () =>
                                router.push(
                                  `/admin/documents?org=${encodeURIComponent(run.organisationId)}&folder=my_onboarding`
                                ),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <StartOnboardingDialog
        open={startOpen}
        orgs={startableOrgs}
        onClose={closeStart}
        onStarted={(run) => {
          toastSuccess(`Onboarding started for ${run.organisation.name}.`);
          void load();
          router.push(`/admin/onboarding/${run.id}`);
        }}
      />
    </AppShell>
  );
}
