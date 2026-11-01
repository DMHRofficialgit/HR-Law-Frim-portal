"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { EsignSheet } from "../../../components/EsignSheet";
import { ProfileSignaturePanel } from "../../../components/ProfileSignaturePanel";
import { apiFetch, type PublicUser } from "../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import { adminNav } from "../../../lib/nav";
import {
  esignQueueAction,
  isActiveSignatureStatus,
  signatureProgress,
  signatureStatusLabel,
  type SignatureRequestRow,
} from "../../../lib/signatures";

type OrgOption = { id: string; name: string };
type QueueFilter = "active" | "completed" | "all";

function AdminSignaturesInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [orgFilter, setOrgFilter] = useState("");
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("active");
  const [requests, setRequests] = useState<SignatureRequestRow[]>([]);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  async function loadRequests(token: string | null, filterOrg: string) {
    const q = filterOrg ? `?organisationId=${encodeURIComponent(filterOrg)}` : "";
    const result = await apiFetch<{ requests: SignatureRequestRow[] }>(
      `/admin/signature-requests${q}`,
      { token }
    );
    if (result.success) setRequests(result.data.requests);
    else setError(result.error.message);
  }

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
  }, [router, search]);

  useEffect(() => {
    if (!user) return;
    loadRequests(getToken(), orgFilter);
  }, [orgFilter, user]);

  if (!user) return null;

  return (
    <AppShell user={user} nav={adminNav} title="Signatures">
      {error ? <div className="error-banner">{error}</div> : null}

      <ProfileSignaturePanel />

      <section className="panel">
        <h2>Signature queue</h2>
        <p className="lead">
          Start from Documents → Request signature. This list is a status queue only.
        </p>
        <div className="field" style={{ maxWidth: 420 }}>
          <label>Filter organisation</label>
          <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}>
            <option value="">All</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ maxWidth: 420 }}>
          <label>Queue</label>
          <select
            value={queueFilter}
            onChange={(e) => setQueueFilter(e.target.value as QueueFilter)}
          >
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="all">All</option>
          </select>
        </div>
        <ul className="org-list">
          {requests
            .filter((r) => {
              if (queueFilter === "active") return isActiveSignatureStatus(r.status);
              if (queueFilter === "completed") return r.status === "reviewed";
              return true;
            })
            .map((r) => {
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
                  ? ` · waiting on ${p.waitingNames.join(", ")}`
                  : "";
              return (
            <li key={r.id}>
              <div>
                <div className="org-name">
                  {r.title}
                  {qa.action === "sign" ? (
                    <span className="esign-queue-badge needs-you">Needs you</span>
                  ) : null}
                </div>
                <div className="org-meta">
                  {r.organisation.name} · {signatureStatusLabel(r.status)} · {r.sourceFileName}
                  {p.total ? ` · ${p.done}/${p.total}${wait}` : ""}
                </div>
              </div>
              <button
                type="button"
                className={`btn btn-sm ${
                  qa.action === "sign" || qa.action === "send" || qa.action === "review"
                    ? "btn-primary"
                    : "btn-secondary"
                }`}
                onClick={() => setOpenId(r.id)}
              >
                {qa.label}
              </button>
            </li>
              );
          })}
        </ul>
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
