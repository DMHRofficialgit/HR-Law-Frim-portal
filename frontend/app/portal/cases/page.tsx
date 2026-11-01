"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { apiFetch, type PublicUser } from "../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import { statusLabel } from "../../../lib/cases";
import { clientNav } from "../../../lib/nav";

type CaseRow = {
  id: string;
  ref: string;
  title: string;
  status: string;
  updatedAt: string;
  category: { name: string };
  employee: { name: string } | null;
};

export default function PortalCasesPage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "client") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
    (async () => {
      const result = await apiFetch<{ cases: CaseRow[] }>("/client/cases", { token });
      if (result.success) setCases(result.data.cases);
      else setError(result.error.message);
    })();
  }, [router]);

  if (!user) return null;

  return (
    <AppShell user={user} nav={clientNav} title="Employment cases">
      {error ? <div className="error-banner">{error}</div> : null}

      <div style={{ marginBottom: 16 }}>
        <Link href="/portal/cases/new" className="btn btn-primary">
          Submit a case
        </Link>
      </div>

      <section className="panel">
        <h2>My cases</h2>
        <p className="lead">{cases.length} case(s)</p>
        <ul className="org-list">
          {cases.map((c) => (
            <li key={c.id}>
              <div>
                <div className="org-name">
                  {c.ref} · {c.title}
                </div>
                <div className="org-meta">
                  {c.category.name} · {statusLabel(c.status)}
                  {c.employee ? ` · ${c.employee.name}` : ""}
                </div>
              </div>
              <Link href={`/portal/cases/${c.id}`} className="btn btn-secondary btn-sm">
                View
              </Link>
            </li>
          ))}
        </ul>
        {cases.length === 0 ? (
          <div className="empty-state">
            <p>No cases yet</p>
            <p className="lead">Submit an employment case to start a conversation with DMHR.</p>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
