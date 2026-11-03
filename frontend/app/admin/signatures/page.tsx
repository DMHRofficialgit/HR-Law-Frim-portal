"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  ClipboardPen,
  Eye,
  FolderOpen,
  Inbox,
  PenLine,
  Send,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { EsignSheet } from "../../../components/EsignSheet";
import { PortalSearch } from "../../../components/PortalSearch";
import { PortalSelect } from "../../../components/PortalSelect";
import { ProfileSignaturePanel } from "../../../components/ProfileSignaturePanel";
import { RowActionsMenu } from "../../../components/RowActionsMenu";
import { MetricSkeleton, TableSkeleton } from "../../../components/Skeleton";
import { apiFetch, type PublicUser } from "../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import { adminNav } from "../../../lib/nav";
import {
  countSignaturesByKpi,
  esignQueueAction,
  signatureBadgeTone,
  signatureMatchesKpi,
  signatureProgress,
  signatureStatusLabel,
  type SignatureKpiKey,
  type SignatureRequestRow,
} from "../../../lib/signatures";

type OrgOption = { id: string; name: string };

function AdminSignaturesInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [orgFilter, setOrgFilter] = useState("");
  const [filter, setFilter] = useState("");
  const [kpi, setKpi] = useState<SignatureKpiKey>("all");
  const [requests, setRequests] = useState<SignatureRequestRow[]>([]);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRequests = useCallback(async (token: string | null, filterOrg: string) => {
    setLoading(true);
    const q = filterOrg ? `?organisationId=${encodeURIComponent(filterOrg)}` : "";
    const result = await apiFetch<{ requests: SignatureRequestRow[] }>(
      `/admin/signature-requests${q}`,
      { token }
    );
    if (result.success) {
      setRequests(result.data.requests);
      setError("");
    } else {
      setError(result.error.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "admin") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
    const open = search.get("open");
    if (open) setOpenId(open);
    (async () => {
      const orgsRes = await apiFetch<{ organisations: OrgOption[] }>("/admin/organisations", {
        token,
      });
      if (orgsRes.success) setOrgs(orgsRes.data.organisations);
      await loadRequests(token, "");
    })();
  }, [router, search, loadRequests]);

  useEffect(() => {
    if (!user) return;
    loadRequests(getToken(), orgFilter);
  }, [orgFilter, user, loadRequests]);

  const kpiCounts = useMemo(
    () => (user ? countSignaturesByKpi(requests, "admin", user.id) : null),
    [requests, user]
  );

  const filtered = useMemo(() => {
    if (!user) return [];
    const needle = filter.trim().toLowerCase();
    return requests.filter((r) => {
      if (!signatureMatchesKpi(r, kpi, "admin", user.id)) return false;
      if (!needle) return true;
      const p = signatureProgress(r.fields || []);
      const hay = [
        r.title,
        r.organisation.name,
        r.sourceFileName,
        signatureStatusLabel(r.status),
        p.waitingNames.join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [requests, filter, kpi, user]);

  if (!user) return null;

  const kpiCards: Array<{
    key: SignatureKpiKey;
    label: string;
    hint: string;
    icon: typeof Inbox;
  }> = [
    { key: "all", label: "All", hint: "Full signature queue", icon: ClipboardPen },
    { key: "needs_you", label: "Needs you", hint: "Your fields to finish", icon: PenLine },
    { key: "ready", label: "Ready to send", hint: "Mark Ready — send to client", icon: Send },
    { key: "awaiting", label: "Awaiting", hint: "Waiting on signers", icon: Inbox },
    { key: "review", label: "Review", hint: "Signed — Admin complete", icon: ShieldCheck },
    { key: "completed", label: "Completed", hint: "Reviewed and filed", icon: CheckCircle2 },
  ];

  return (
    <AppShell user={user} nav={adminNav} title="Signatures">
      {error ? <div className="error-banner">{error}</div> : null}

      <ProfileSignaturePanel compact />

      {loading || !kpiCounts ? (
        <MetricSkeleton count={6} />
      ) : (
        <div
          className="metrics-row case-metrics-row sig-metrics-row"
          role="group"
          aria-label="Signature queue summary"
        >
          {kpiCards.map(({ key, label, hint, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={`metric-card metric-card-link case-metric-card${
                kpi === key ? " is-active" : ""
              }`}
              onClick={() => setKpi((prev) => (prev === key && key !== "all" ? "all" : key))}
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
            <h2>Signature queue</h2>
            <p className="lead">
              {loading
                ? "…"
                : `${filtered.length} request${filtered.length === 1 ? "" : "s"}`}
              {!loading && requests.length !== filtered.length
                ? ` · ${requests.length} total`
                : ""}
              {!loading ? " · Start from Documents → Request signature" : ""}
            </p>
          </div>
          <Link href="/admin/documents" className="btn btn-secondary btn-sm">
            Open documents
          </Link>
        </div>

        <div className="org-toolbar org-directory-toolbar">
          <div className="org-toolbar-search">
            <PortalSearch
              mode="inline"
              nav={adminNav}
              role="admin"
              value={filter}
              onQueryChange={setFilter}
              placeholder="Search title, client, or file…"
              aria-label="Filter signature requests"
            />
          </div>
          <PortalSelect
            className="org-filter"
            size="sm"
            aria-label="Filter organisation"
            value={orgFilter}
            searchable
            options={[
              { value: "", label: "All organisations" },
              ...orgs.map((o) => ({ value: o.id, label: o.name })),
            ]}
            onChange={setOrgFilter}
          />
        </div>

        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p>
              {requests.length === 0
                ? "No signature requests yet."
                : "No requests match these filters."}
            </p>
            <p className="lead">
              Open a client PDF in Documents and choose Request signature.
            </p>
            <Link href="/admin/documents" className="btn btn-primary btn-sm">
              Go to documents
            </Link>
          </div>
        ) : (
          <div className="table-wrap sig-queue-scroll">
            <table className="data-table org-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th className="org-table-actions-col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const p = signatureProgress(r.fields || []);
                  const qa = esignQueueAction({
                    status: r.status,
                    role: "admin",
                    userId: user.id,
                    fields: r.fields || [],
                  });
                  const wait =
                    p.waitingNames.length &&
                    (r.status === "awaiting_signature" ||
                      r.status === "revision_requested" ||
                      r.status === "sent")
                      ? `Waiting on ${p.waitingNames.join(", ")}`
                      : "";
                  const primary =
                    qa.action === "sign" ||
                    qa.action === "send" ||
                    qa.action === "review";
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="primary-cell" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          {r.title}
                          {qa.action === "sign" ? (
                            <span className="esign-queue-badge needs-you">Needs you</span>
                          ) : null}
                        </div>
                        <div className="secondary-cell">{r.sourceFileName}</div>
                      </td>
                      <td>
                        <span className="primary-cell">{r.organisation.name}</span>
                      </td>
                      <td>
                        <span
                          className={`status-pill status-pill-${signatureBadgeTone(r.status)}`}
                        >
                          {signatureStatusLabel(r.status)}
                        </span>
                      </td>
                      <td>
                        <span className="org-table-muted">
                          {p.total ? `${p.done}/${p.total}` : "—"}
                          {wait ? (
                            <>
                              <br />
                              {wait}
                            </>
                          ) : null}
                        </span>
                      </td>
                      <td className="org-table-actions-col">
                        <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className={`btn btn-sm ${
                              primary ? "btn-primary" : "btn-secondary"
                            }`}
                            onClick={() => setOpenId(r.id)}
                          >
                            {qa.label}
                          </button>
                          <RowActionsMenu
                            label={`Actions for ${r.title}`}
                            items={[
                              {
                                id: "open",
                                label: "Open request",
                                icon: <Eye size={14} strokeWidth={1.75} />,
                                onSelect: () => setOpenId(r.id),
                              },
                              {
                                id: "docs",
                                label: "Client documents",
                                icon: <FolderOpen size={14} strokeWidth={1.75} />,
                                onSelect: () =>
                                  router.push(
                                    `/admin/documents?org=${encodeURIComponent(
                                      r.organisation.id
                                    )}`
                                  ),
                              },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {openId ? (
        <EsignSheet
          role="admin"
          requestId={openId}
          onClose={() => {
            setOpenId(null);
            router.replace("/admin/signatures");
          }}
          onChanged={() => loadRequests(getToken(), orgFilter)}
        />
      ) : null}
    </AppShell>
  );
}

export default function AdminSignaturesPage() {
  return (
    <Suspense fallback={<main className="auth-shell">Loading…</main>}>
      <AdminSignaturesInner />
    </Suspense>
  );
}
