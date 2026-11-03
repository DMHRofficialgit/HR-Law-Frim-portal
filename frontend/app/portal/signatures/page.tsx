"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, ClipboardPen, Clock3, PenLine } from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { EsignSheet } from "../../../components/EsignSheet";
import { PortalSearch } from "../../../components/PortalSearch";
import { ProfileSignaturePanel } from "../../../components/ProfileSignaturePanel";
import { MetricSkeleton, TableSkeleton } from "../../../components/Skeleton";
import { apiFetch, type PublicUser } from "../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import { clientNav } from "../../../lib/nav";
import {
  clientSignatureMatchesKpi,
  countClientSignaturesByKpi,
  esignQueueAction,
  signatureBadgeTone,
  signatureProgress,
  signatureStatusLabel,
  type ClientSignatureKpiKey,
  type SignatureRequestRow,
} from "../../../lib/signatures";

function ClientSignaturesInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [requests, setRequests] = useState<SignatureRequestRow[]>([]);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [kpi, setKpi] = useState<ClientSignatureKpiKey>("all");

  const load = useCallback(async (token: string | null) => {
    setLoading(true);
    const result = await apiFetch<{ requests: SignatureRequestRow[] }>(
      "/client/signature-requests",
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
    if (!token || !stored || stored.role !== "client") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
    const open = search.get("open");
    if (open) setOpenId(open);
    load(token);
  }, [router, search, load]);

  const kpiCounts = useMemo(
    () => (user ? countClientSignaturesByKpi(requests, user.id) : null),
    [requests, user]
  );

  const filtered = useMemo(() => {
    if (!user) return [];
    const needle = filter.trim().toLowerCase();
    return requests.filter((r) => {
      if (!clientSignatureMatchesKpi(r, kpi, user.id)) return false;
      if (!needle) return true;
      const hay = [r.title, r.sourceFileName, signatureStatusLabel(r.status)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [requests, filter, kpi, user]);

  if (!user) return null;

  const kpiCards: Array<{
    key: ClientSignatureKpiKey;
    label: string;
    hint: string;
    icon: typeof PenLine;
  }> = [
    { key: "all", label: "All", hint: "Your signature queue", icon: ClipboardPen },
    { key: "needs_you", label: "Needs you", hint: "Ready to sign now", icon: PenLine },
    { key: "waiting", label: "In progress", hint: "Waiting on others or DM.HR", icon: Clock3 },
    { key: "completed", label: "Completed", hint: "Reviewed by DM.HR", icon: CheckCircle2 },
  ];

  return (
    <AppShell user={user} nav={clientNav} title="Signatures">
      {error ? <div className="error-banner">{error}</div> : null}

      <ProfileSignaturePanel compact />

      {loading || !kpiCounts ? (
        <MetricSkeleton count={4} />
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
            <h2>Documents to sign</h2>
            <p className="lead">
              {loading
                ? "…"
                : `${filtered.length} request${filtered.length === 1 ? "" : "s"}`}
              {!loading && requests.length !== filtered.length
                ? ` · ${requests.length} total`
                : ""}
            </p>
          </div>
          <Link href="/portal/onboarding" className="btn btn-secondary btn-sm">
            My Onboarding
          </Link>
        </div>

        <div className="org-toolbar org-directory-toolbar">
          <div className="org-toolbar-search">
            <PortalSearch
              mode="inline"
              nav={clientNav}
              role="client"
              value={filter}
              onQueryChange={setFilter}
              placeholder="Search title or file…"
              aria-label="Filter signature requests"
            />
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p>
              {requests.length === 0
                ? "Nothing to sign yet."
                : "No requests match these filters."}
            </p>
            <p className="lead">
              When DM.HR sends a document for signature, it will appear here. Pack items also
              show on My Onboarding.
            </p>
            <Link href="/portal/onboarding" className="btn btn-primary btn-sm">
              Open My Onboarding
            </Link>
          </div>
        ) : (
          <div className="table-wrap sig-queue-scroll">
            <table className="data-table org-table">
              <thead>
                <tr>
                  <th>Document</th>
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
                    role: "client",
                    userId: user.id,
                    fields: r.fields || [],
                  });
                  const wait =
                    p.waitingNames.length && qa.action === "sign"
                      ? `Waiting on ${p.waitingNames.join(", ")}`
                      : p.waitingNames.length &&
                          r.status !== "reviewed" &&
                          r.status !== "signed_returned"
                        ? `Waiting on ${p.waitingNames.join(", ")}`
                        : "";
                  return (
                    <tr key={r.id}>
                      <td>
                        <div
                          className="primary-cell"
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          {r.title}
                          {qa.action === "sign" ? (
                            <span className="esign-queue-badge needs-you">Needs you</span>
                          ) : null}
                        </div>
                        <div className="secondary-cell">{r.sourceFileName}</div>
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
                        <button
                          type="button"
                          className={`btn btn-sm ${
                            qa.action === "sign" ? "btn-primary" : "btn-secondary"
                          }`}
                          onClick={() => setOpenId(r.id)}
                        >
                          {qa.label}
                        </button>
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
          role="client"
          requestId={openId}
          onClose={() => {
            setOpenId(null);
            router.replace("/portal/signatures");
          }}
          onChanged={() => load(getToken())}
        />
      ) : null}
    </AppShell>
  );
}

export default function ClientSignaturesPage() {
  return (
    <Suspense fallback={<main className="auth-shell">Loading…</main>}>
      <ClientSignaturesInner />
    </Suspense>
  );
}
