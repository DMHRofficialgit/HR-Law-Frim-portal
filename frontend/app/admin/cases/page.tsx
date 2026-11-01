"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { apiFetch, type PublicUser } from "../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import { statusLabel } from "../../../lib/cases";
import { adminNav } from "../../../lib/nav";

type CaseRow = {
  id: string;
  ref: string;
  title: string;
  status: string;
  updatedAt: string;
  category: { name: string };
  organisation: { id: string; name: string };
  employee: { name: string } | null;
};

type OrgOption = { id: string; name: string };

function AdminCasesInner() {
  const router = useRouter();
  const search = useSearchParams();
  const orgFromUrl = search.get("org") || "";
  const [user, setUser] = useState<PublicUser | null>(null);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [orgId, setOrgId] = useState(orgFromUrl);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "admin") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
    (async () => {
      const orgsRes = await apiFetch<{ organisations: OrgOption[] }>("/admin/organisations", {
        token,
      });
      if (orgsRes.success) {
        setOrgs(orgsRes.data.organisations);
        if (orgFromUrl) setOrgId(orgFromUrl);
      }
    })();
  }, [router, orgFromUrl]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    (async () => {
      const q = orgId ? `?organisationId=${encodeURIComponent(orgId)}` : "";
      const result = await apiFetch<{ cases: CaseRow[] }>(`/admin/cases${q}`, { token });
      if (result.success) setCases(result.data.cases);
      else setError(result.error.message);
    })();
  }, [orgId]);

  if (!user) return null;

  return (
    <AppShell user={user} nav={adminNav} title="Employment cases">
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="panel" style={{ marginBottom: 16 }}>
        <h2>Filter</h2>
        <div className="field" style={{ maxWidth: 420, marginBottom: 0 }}>
          <label>Organisation</label>
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            <option value="">All organisations</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="panel">
        <h2>Cases</h2>
        <p className="lead">{cases.length} case(s)</p>
        <ul className="org-list">
          {cases.map((c) => (
            <li key={c.id}>
              <div>
                <div className="org-name">
                  {c.ref} · {c.title}
                </div>
                <div className="org-meta">
                  {c.organisation.name} · {c.category.name} · {statusLabel(c.status)}
                  {c.employee ? ` · ${c.employee.name}` : ""}
                </div>
              </div>
              <Link href={`/admin/cases/${c.id}`} className="btn btn-primary btn-sm">
                Open
              </Link>
            </li>
          ))}
        </ul>
      </section>
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
