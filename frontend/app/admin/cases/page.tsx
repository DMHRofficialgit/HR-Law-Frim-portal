"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Briefcase, CheckCircle2, Clock3, Eye, Inbox, Pencil, Trash2 } from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { CaseFormDialog } from "../../../components/CaseFormDialog";
import { PortalSearch } from "../../../components/PortalSearch";
import { PortalSelect } from "../../../components/PortalSelect";
import { RowActionsMenu } from "../../../components/RowActionsMenu";
import { MetricSkeleton, TableSkeleton } from "../../../components/Skeleton";
import { useConfirm } from "../../../context/ConfirmContext";
import { useToast } from "../../../context/ToastContext";
import { apiFetch, type PublicUser } from "../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import {
  caseBadgeTone,
  caseMatchesKpi,
  categoryDisplayName,
  countCasesByKpi,
  formatCaseDate,
  statusLabel,
  type CaseCategory,
  type CaseKpiKey,
  type CaseRow,
} from "../../../lib/cases";
import { adminNav } from "../../../lib/nav";

type OrgOption = { id: string; name: string };

function AdminCasesInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { error: toastError, success: toastSuccess } = useToast();
  const { confirm } = useConfirm();
  const orgFromUrl = search.get("org") || "";
  const employeeFromUrl = search.get("employee") || "";
  const createFromUrl = search.get("create") === "1";
  const openOnlyFromUrl = search.get("open") === "1";

  const [user, setUser] = useState<PublicUser | null>(null);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [categories, setCategories] = useState<CaseCategory[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [orgFilter, setOrgFilter] = useState(orgFromUrl);
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [kpi, setKpi] = useState<CaseKpiKey>("all");
  const [dialogOpen, setDialogOpen] = useState(createFromUrl);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const q = orgFilter ? `?organisationId=${encodeURIComponent(orgFilter)}` : "";
    const result = await apiFetch<{ cases: CaseRow[] }>(`/admin/cases${q}`, {
      token: getToken(),
    });
    if (result.success) {
      setCases(result.data.cases);
      setError("");
    } else {
      setError(result.error.message);
      toastError(result.error.message);
    }
    setLoading(false);
  }, [orgFilter, toastError]);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "admin") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
    (async () => {
      const [orgsRes, catsRes] = await Promise.all([
        apiFetch<{ organisations: OrgOption[] }>("/admin/organisations", { token }),
        apiFetch<{ categories: CaseCategory[] }>("/admin/case-categories", { token }),
      ]);
      if (orgsRes.success) {
        setOrgs(orgsRes.data.organisations.map((o) => ({ id: o.id, name: o.name })));
      }
      if (catsRes.success) {
        setCategories(catsRes.data.categories.filter((c) => c.active !== false));
      }
    })();
  }, [router]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  useEffect(() => {
    if (orgFromUrl) setOrgFilter(orgFromUrl);
  }, [orgFromUrl]);

  useEffect(() => {
    if (createFromUrl) setDialogOpen(true);
  }, [createFromUrl]);

  const kpiCounts = useMemo(() => countCasesByKpi(cases), [cases]);

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return cases.filter((c) => {
      if (employeeFromUrl) {
        const empId = c.employeeId || c.employee?.id || "";
        if (empId !== employeeFromUrl) return false;
      }
      if (openOnlyFromUrl && c.status === "closed") return false;
      if (!caseMatchesKpi(c.status, kpi)) return false;
      if (statusFilter && c.status !== statusFilter) return false;
      if (categoryFilter) {
        const catId = c.category?.id || c.categoryId || "";
        if (catId !== categoryFilter) return false;
      }
      if (!needle) return true;
      const hay = [
        c.ref,
        c.title,
        categoryDisplayName(c.category, c.categoryOther),
        c.organisation?.name,
        c.employee?.name,
        statusLabel(c.status),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [cases, filter, kpi, statusFilter, categoryFilter, employeeFromUrl, openOnlyFromUrl]);

  async function onDelete(c: CaseRow) {
    const ok = await confirm({
      title: `Delete ${c.ref}?`,
      description: "This cannot be undone.",
      confirmLabel: "Delete case",
      tone: "danger",
    });
    if (!ok) return;
    setBusyId(c.id);
    const result = await apiFetch<{ id: string }>(`/admin/cases/${c.id}`, {
      method: "DELETE",
      token: getToken(),
    });
    setBusyId(null);
    if (!result.success) {
      toastError(result.error.message);
      return;
    }
    toastSuccess("Case deleted");
    await load();
  }

  if (!user) return null;

  const kpiCards: Array<{
    key: CaseKpiKey;
    label: string;
    hint: string;
    icon: typeof Briefcase;
  }> = [
    {
      key: "all",
      label: "All cases",
      hint: "Full case register",
      icon: Briefcase,
    },
    {
      key: "received",
      label: "Received",
      hint: "Submitted, awaiting review",
      icon: Inbox,
    },
    {
      key: "pending",
      label: "Pending",
      hint: "In progress with DM.HR",
      icon: Clock3,
    },
    {
      key: "closed",
      label: "Closed",
      hint: "Completed matters",
      icon: CheckCircle2,
    },
  ];

  return (
    <AppShell user={user} nav={adminNav} title="Employment cases">
      {error ? <div className="error-banner">{error}</div> : null}

      {loading ? (
        <MetricSkeleton count={4} />
      ) : (
        <div className="metrics-row case-metrics-row" role="group" aria-label="Case status summary">
          {kpiCards.map(({ key, label, hint, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={`metric-card metric-card-link case-metric-card${
                kpi === key ? " is-active" : ""
              }`}
              onClick={() => setKpi(key)}
              aria-pressed={kpi === key}
            >
              <Icon className="case-metric-icon" size={16} strokeWidth={1.75} aria-hidden />
              <div className="metric-value">{kpiCounts[key]}</div>
              <div className="metric-label">{label}</div>
              <p className="metric-hint">{hint}</p>
            </button>
          ))}
        </div>
      )}

      <section className="panel org-directory">
        <div className="org-directory-head">
          <div>
            <h2>Case register</h2>
            <p className="lead">
              {loading ? "…" : `${filtered.length} case${filtered.length === 1 ? "" : "s"}`}
              {!loading && cases.length !== filtered.length ? ` · ${cases.length} total` : ""}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setDialogOpen(true)}
          >
            + Create case
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
              placeholder="Search reference, title, client…"
              aria-label="Filter cases"
            />
          </div>
          <PortalSelect
            className="org-filter"
            size="sm"
            aria-label="Filter by status"
            value={statusFilter}
            options={[
              { value: "", label: "All statuses" },
              ...[
                { value: "submitted", label: "Submitted" },
                { value: "allocated", label: "Allocated" },
                { value: "in_progress", label: "In progress" },
                { value: "information_required", label: "Information required" },
                { value: "final_stages", label: "Final stages" },
                { value: "closed", label: "Closed" },
              ],
            ]}
            onChange={setStatusFilter}
          />
          <PortalSelect
            className="org-filter"
            size="sm"
            aria-label="Filter by client"
            value={orgFilter}
            searchable
            options={[
              { value: "", label: "All clients" },
              ...orgs.map((o) => ({ value: o.id, label: o.name })),
            ]}
            onChange={setOrgFilter}
          />
          <PortalSelect
            className="org-filter"
            size="sm"
            aria-label="Filter by category"
            value={categoryFilter}
            options={[
              { value: "", label: "All categories" },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
            onChange={setCategoryFilter}
          />
        </div>

        {loading ? (
          <TableSkeleton rows={7} cols={7} />
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p>No cases match these filters.</p>
            <p className="lead">Create a case for a client organisation to get started.</p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setDialogOpen(true)}
            >
              + Create case
            </button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table org-table">
              <thead>
                <tr>
                  <th>Case reference</th>
                  <th>Client</th>
                  <th>Case title</th>
                  <th>Submitted</th>
                  <th>Last updated</th>
                  <th>Status</th>
                  <th className="org-table-actions-col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div>
                        <Link href={`/admin/cases/${c.id}`} className="primary-cell">
                          {c.ref}
                        </Link>
                        <span className="secondary-cell">
                          {categoryDisplayName(c.category, c.categoryOther)}
                        </span>
                      </div>
                    </td>
                    <td>
                      {c.organisation ? (
                        <Link
                          href={`/admin/organisations/${c.organisation.id}`}
                          className="primary-cell"
                        >
                          {c.organisation.name}
                        </Link>
                      ) : (
                        <span className="org-table-muted">—</span>
                      )}
                    </td>
                    <td>
                      <div>
                        <span className="primary-cell">{c.title}</span>
                        <span className="secondary-cell">
                          {c.employee?.name || "No employee linked"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="org-table-muted">{formatCaseDate(c.createdAt)}</span>
                    </td>
                    <td>
                      <span className="org-table-muted">{formatCaseDate(c.updatedAt)}</span>
                    </td>
                    <td>
                      <span className={`status-pill status-pill-${caseBadgeTone(c.status)}`}>
                        {statusLabel(c.status)}
                      </span>
                    </td>
                    <td className="org-table-actions-col">
                      <RowActionsMenu
                        label={`Actions for ${c.ref}`}
                        items={[
                          {
                            id: "view",
                            label: "View case",
                            icon: <Eye size={14} strokeWidth={1.75} />,
                            onSelect: () => router.push(`/admin/cases/${c.id}`),
                          },
                          {
                            id: "edit",
                            label: "Edit",
                            icon: <Pencil size={14} strokeWidth={1.75} />,
                            onSelect: () =>
                              router.push(`/admin/cases/${c.id}?edit=1`),
                          },
                          {
                            id: "delete",
                            label: "Delete",
                            icon: <Trash2 size={14} strokeWidth={1.75} />,
                            tone: "danger",
                            separatorBefore: true,
                            disabled: busyId === c.id,
                            onSelect: () => onDelete(c),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CaseFormDialog
        open={dialogOpen}
        mode="create"
        role="admin"
        orgs={orgs}
        categories={categories}
        initialOrganisationId={orgFilter || orgs[0]?.id || ""}
        initialEmployeeId={employeeFromUrl}
        onClose={() => setDialogOpen(false)}
        onSaved={(created) => {
          setDialogOpen(false);
          router.push(`/admin/cases/${created.id}`);
        }}
      />
    </AppShell>
  );
}

export default function AdminCasesPage() {
  return (
    <Suspense fallback={<main className="auth-shell">Loading…</main>}>
      <AdminCasesInner />
    </Suspense>
  );
}
