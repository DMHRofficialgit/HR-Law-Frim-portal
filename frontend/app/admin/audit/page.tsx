"use client";

import { Suspense, useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Eye,
  KeyRound,
  ScrollText,
  Shield,
  ShieldAlert,
  X,
} from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { IconButton } from "../../../components/IconButton";
import { PortalDateRange } from "../../../components/PortalDateRange";
import { PortalSearch } from "../../../components/PortalSearch";
import { PortalSelect } from "../../../components/PortalSelect";
import { MetricSkeleton, TableSkeleton } from "../../../components/Skeleton";
import { useToast } from "../../../context/ToastContext";
import { apiFetch, type PublicUser } from "../../../lib/api";
import {
  AUDIT_ACTION_OPTIONS,
  auditActionMeta,
  auditActorInitials,
  auditActorRoleLabel,
  auditEntityHref,
  auditRangeBounds,
  formatAuditTime,
  type AuditCategory,
  type AuditEventRow,
  type AuditRangePreset,
} from "../../../lib/audit";
import { getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import { formatRelativeTime } from "../../../lib/notifications";
import { adminNav } from "../../../lib/nav";

type OrgOption = { id: string; name: string };

type AuditListData = {
  events: AuditEventRow[];
  total: number;
  page: number;
  pageSize: number;
};

type AuditSummaryData = {
  counts: Record<AuditCategory, number>;
};

const RANGE_OPTIONS = [
  { value: "all" as const, label: "All time" },
  { value: "24h" as const, label: "24h" },
  { value: "7d" as const, label: "7d" },
  { value: "30d" as const, label: "30d" },
];

const emptyCounts: Record<AuditCategory, number> = {
  all: 0,
  auth: 0,
  failures: 0,
  workspace: 0,
  system: 0,
};

function AdminAuditInner() {
  const router = useRouter();
  const toast = useToast();
  const detailTitleId = useId();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [events, setEvents] = useState<AuditEventRow[]>([]);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<AuditCategory, number>>(emptyCounts);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [category, setCategory] = useState<AuditCategory>("all");
  const [organisationId, setOrganisationId] = useState("");
  const [rangePreset, setRangePreset] = useState<AuditRangePreset>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [detail, setDetail] = useState<AuditEventRow | null>(null);

  const filterParams = useCallback(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (action) params.set("action", action);
    else if (category !== "all") params.set("category", category);
    if (organisationId) params.set("organisationId", organisationId);
    if (from) params.set("from", new Date(from).toISOString());
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      params.set("to", end.toISOString());
    }
    return params;
  }, [action, category, from, organisationId, q, to]);

  const load = useCallback(async () => {
    setLoading(true);
    const token = getToken();
    const params = filterParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));

    const auditRes = await apiFetch<AuditListData>(`/admin/audit-events?${params}`, {
      token,
    });

    if (auditRes.success) {
      setEvents(auditRes.data.events);
      setTotal(auditRes.data.total);
    } else {
      toast.error(auditRes.error.message);
    }
    setLoading(false);
  }, [filterParams, page, pageSize, toast]);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    const token = getToken();
    const params = filterParams();
    params.delete("action");
    params.delete("category");

    const [summaryRes, orgsRes] = await Promise.all([
      apiFetch<AuditSummaryData>(`/admin/audit-events/summary?${params}`, { token }),
      apiFetch<{ organisations: OrgOption[] }>("/admin/organisations", { token }),
    ]);

    if (summaryRes.success) {
      setCounts(summaryRes.data.counts);
    }
    if (orgsRes.success) {
      setOrgs(orgsRes.data.organisations.map((o) => ({ id: o.id, name: o.name })));
    }
    setSummaryLoading(false);
  }, [filterParams]);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "admin") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    if (stored.mustChangePassword) {
      router.replace("/change-password");
      return;
    }
    setUser(stored);
  }, [router]);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  useEffect(() => {
    if (!user) return;
    void loadSummary();
  }, [user, loadSummary]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const orgOptions = useMemo(
    () => [
      { value: "", label: "All organisations" },
      ...orgs.map((o) => ({ value: o.id, label: o.name })),
    ],
    [orgs]
  );

  const hasFilters = Boolean(
    q.trim() || action || category !== "all" || organisationId || from || to
  );

  const clearFilters = () => {
    setPage(1);
    setQ("");
    setAction("");
    setCategory("all");
    setOrganisationId("");
    setRangePreset("all");
    setFrom("");
    setTo("");
  };

  const applyRangePreset = (preset: AuditRangePreset) => {
    setRangePreset(preset);
    const bounds = auditRangeBounds(preset);
    setPage(1);
    setFrom(bounds.from);
    setTo(bounds.to);
  };

  const kpiCards: {
    key: AuditCategory;
    label: string;
    hint: string;
    icon: typeof ScrollText;
  }[] = [
    { key: "all", label: "All events", hint: "Full trail", icon: ScrollText },
    { key: "auth", label: "Sign-in", hint: "Auth & sessions", icon: KeyRound },
    { key: "failures", label: "Failures", hint: "Failed logins", icon: ShieldAlert },
    { key: "workspace", label: "Workspace", hint: "Docs, cases, users", icon: Briefcase },
    { key: "system", label: "System", hint: "Ops & settings", icon: Shield },
  ];

  const detailMeta = detail ? auditActionMeta(detail.action) : null;
  const DetailIcon = detailMeta?.Icon || ScrollText;
  const detailHref = detail
    ? auditEntityHref(detail.entityType, detail.entityId, detail.organisationId)
    : null;

  if (!user) return null;

  return (
    <AppShell user={user} nav={adminNav} title="Audit">
      {summaryLoading ? (
        <MetricSkeleton count={5} className="audit-metrics-row" />
      ) : (
        <div
          className="metrics-row case-metrics-row audit-metrics-row"
          role="group"
          aria-label="Audit categories"
        >
          {kpiCards.map(({ key, label, hint, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={`metric-card metric-card-link case-metric-card${
                category === key && !action ? " is-active" : ""
              }`}
              onClick={() => {
                setPage(1);
                setAction("");
                setCategory(key);
              }}
              aria-pressed={category === key && !action}
            >
              <Icon className="case-metric-icon" size={18} strokeWidth={1.75} aria-hidden />
              <div className="metric-value">{counts[key]}</div>
              <div className="metric-label">{label}</div>
              <p className="metric-hint">{hint}</p>
            </button>
          ))}
        </div>
      )}

      <section className="panel org-directory">
        <div className="org-directory-head">
          <div>
            <h2>Audit trail</h2>
            <p className="lead">
              {loading ? "…" : `${total} event${total === 1 ? "" : "s"}`}
              {!loading && pageCount > 1 ? ` · page ${page} of ${pageCount}` : ""}
              {" · "}insert-only log kept after org/case purge
            </p>
          </div>
          <div className="org-directory-head-actions">
            {hasFilters ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
                Clear filters
              </button>
            ) : null}
          </div>
        </div>

        <div className="org-toolbar org-directory-toolbar audit-toolbar">
          <div className="org-toolbar-search">
            <PortalSearch
              mode="inline"
              nav={adminNav}
              role="admin"
              value={q}
              onQueryChange={(v) => {
                setPage(1);
                setQ(v);
              }}
              placeholder="Search summary, email, action…"
              aria-label="Search audit events"
            />
          </div>
          <PortalSelect
            className="org-filter"
            size="sm"
            searchable
            value={action}
            onChange={(v) => {
              setPage(1);
              setAction(v);
              if (v) setCategory("all");
            }}
            options={[{ value: "", label: "All actions" }, ...AUDIT_ACTION_OPTIONS]}
            aria-label="Filter by action"
          />
          <PortalSelect
            className="org-filter"
            size="sm"
            searchable
            value={organisationId}
            onChange={(v) => {
              setPage(1);
              setOrganisationId(v);
            }}
            options={orgOptions}
            aria-label="Filter by organisation"
          />
        </div>

        <div className="audit-toolbar-dates" role="group" aria-label="Date filters">
          <div className="choice-toggle audit-range-toggle" role="group" aria-label="Quick range">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`choice-toggle-btn${rangePreset === opt.value ? " active" : ""}`}
                aria-pressed={rangePreset === opt.value}
                onClick={() => applyRangePreset(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <PortalDateRange
            className="audit-portal-dates"
            from={from}
            to={to}
            aria-label="Custom date range"
            onChange={({ from: nextFrom, to: nextTo }) => {
              setPage(1);
              setRangePreset("all");
              setFrom(nextFrom);
              setTo(nextTo);
            }}
          />
        </div>

        {loading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : events.length === 0 ? (
          <div className="empty-state">
            <div className="notify-icon" aria-hidden>
              <ScrollText size={18} strokeWidth={1.75} />
            </div>
            <p>No audit events match these filters.</p>
            <p className="lead">Try another category, date range, or clear filters.</p>
            {hasFilters ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
                Clear filters
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="table-wrap directory-table-scroll">
              <table className="data-table org-table">
                <thead>
                  <tr>
                    <th className="audit-col-time">Time</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Details</th>
                    <th className="org-table-actions-col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((row) => {
                    const meta = auditActionMeta(row.action);
                    const ActionIcon = meta.Icon;
                    const role = auditActorRoleLabel(row.actorRole);
                    return (
                      <tr key={row.id}>
                        <td className="audit-col-time">
                          <span
                            className="primary-cell"
                            title={formatAuditTime(row.createdAt)}
                          >
                            {formatRelativeTime(row.createdAt)}
                          </span>
                        </td>
                        <td>
                          <div className="org-table-company">
                            <span className="org-table-avatar" aria-hidden>
                              {auditActorInitials(row.actorEmail, row.actorRole)}
                            </span>
                            <div className="audit-actor-text">
                              <div className="primary-cell audit-actor-email">
                                {row.actorEmail || "System"}
                              </div>
                              {role ? (
                                <div className="secondary-cell">{role}</div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`status-pill status-pill-${meta.tone} audit-action-pill`}
                          >
                            <ActionIcon size={12} strokeWidth={1.75} aria-hidden />
                            {meta.label}
                          </span>
                        </td>
                        <td>
                          <div className="primary-cell audit-summary-cell">{row.summary}</div>
                          {row.organisationName || row.organisationId ? (
                            <div className="secondary-cell">
                              {row.organisationId ? (
                                <Link href={`/admin/organisations/${row.organisationId}`}>
                                  {row.organisationName || "Organisation"}
                                </Link>
                              ) : (
                                row.organisationName
                              )}
                            </div>
                          ) : row.ip ? (
                            <div className="secondary-cell">{row.ip}</div>
                          ) : null}
                        </td>
                        <td className="org-table-actions-col">
                          <IconButton
                            label="View event"
                            className="notify-icon-btn"
                            onClick={() => setDetail(row)}
                          >
                            <Eye size={16} strokeWidth={1.75} />
                          </IconButton>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="audit-pager">
              <span className="org-table-muted">
                {total} event{total === 1 ? "" : "s"} · page {page} of {pageCount}
              </span>
              <div className="audit-pager-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={page >= pageCount || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {detail && detailMeta ? (
        <div
          className="org-dialog-root"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDetail(null);
          }}
        >
          <button
            type="button"
            className="org-dialog-backdrop"
            aria-label="Close dialog"
            onClick={() => setDetail(null)}
          />
          <div
            className="org-dialog form-compact audit-detail-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={detailTitleId}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="org-dialog-head">
              <div className="audit-detail-head">
                <span className={`notify-icon audit-detail-icon tone-${detailMeta.tone}`} aria-hidden>
                  <DetailIcon size={18} strokeWidth={1.75} />
                </span>
                <div>
                  <h2 id={detailTitleId}>{detailMeta.label}</h2>
                  <p className="org-dialog-lead muted">{detail.summary}</p>
                </div>
              </div>
              <IconButton label="Close" onClick={() => setDetail(null)}>
                <X size={16} strokeWidth={1.75} />
              </IconButton>
            </div>
            <div className="org-dialog-body">
              <div className="detail-list audit-detail-list">
                <div className="detail-item">
                  <small>Time</small>
                  <strong>{formatAuditTime(detail.createdAt)}</strong>
                </div>
                <div className="detail-item">
                  <small>Actor</small>
                  <strong>
                    {detail.actorEmail || "System"}
                    {detail.actorRole
                      ? ` · ${auditActorRoleLabel(detail.actorRole)}`
                      : ""}
                  </strong>
                </div>
                <div className="detail-item">
                  <small>IP</small>
                  <strong>{detail.ip || "—"}</strong>
                </div>
                <div className="detail-item">
                  <small>Organisation</small>
                  <strong>
                    {detail.organisationId ? (
                      <Link href={`/admin/organisations/${detail.organisationId}`}>
                        {detail.organisationName || detail.organisationId}
                      </Link>
                    ) : (
                      detail.organisationName || "—"
                    )}
                  </strong>
                </div>
                <div className="detail-item">
                  <small>Entity</small>
                  <strong>
                    {detail.entityType}
                    {detail.entityId ? ` · ${detail.entityId}` : ""}
                  </strong>
                </div>
                <div className="detail-item">
                  <small>Action code</small>
                  <strong>
                    <code>{detail.action}</code>
                  </strong>
                </div>
              </div>
              {detail.meta != null ? (
                <pre className="audit-meta-block">
                  {JSON.stringify(detail.meta, null, 2)}
                </pre>
              ) : null}
            </div>
            <div className="org-dialog-foot">
              {detailHref ? (
                <Link href={detailHref} className="btn btn-secondary btn-sm">
                  Open related
                </Link>
              ) : null}
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setDetail(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

export default function AdminAuditPage() {
  return (
    <Suspense
      fallback={
        <main className="auth-shell">
          <p className="lead">Loading…</p>
        </main>
      }
    >
      <AdminAuditInner />
    </Suspense>
  );
}
