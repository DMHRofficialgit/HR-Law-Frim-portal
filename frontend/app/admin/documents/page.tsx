"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { DocumentsPanel } from "../../../components/DocumentsPanel";
import { EsignSheet } from "../../../components/EsignSheet";
import { apiFetch, type PublicUser } from "../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import { adminNav } from "../../../lib/nav";
import { isPdfDocument } from "../../../lib/signatures";

type OrgOption = { id: string; name: string };

function AdminDocumentsInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [orgId, setOrgId] = useState("");
  const [esignId, setEsignId] = useState<string | null>(null);
  const [esignError, setEsignError] = useState("");

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored) {
      router.replace("/login");
      return;
    }
    if (stored.role !== "admin") {
      router.replace(homeForUser(stored));
      return;
    }
    if (stored.mustChangePassword) {
      router.replace("/change-password");
      return;
    }
    setUser(stored);

    async function load() {
      const result = await apiFetch<{ organisations: OrgOption[] }>("/admin/organisations", {
        token,
      });
      if (result.success) {
        setOrgs(result.data.organisations.map((o) => ({ id: o.id, name: o.name })));
        const fromQuery = search.get("org");
        const initial =
          (fromQuery && result.data.organisations.some((o) => o.id === fromQuery) && fromQuery) ||
          result.data.organisations[0]?.id ||
          "";
        setOrgId(initial);
      }
    }
    load();
  }, [router, search]);

  const orgName = useMemo(
    () => orgs.find((o) => o.id === orgId)?.name || "",
    [orgs, orgId]
  );

  async function startEsign(documentId: string, title: string, mimeType: string | null) {
    setEsignError("");
    if (!isPdfDocument(mimeType, title)) {
      setEsignError("E-sign requires a PDF document.");
      return;
    }
    if (!orgId) return;
    const result = await apiFetch<{ request: { id: string }; reused?: boolean }>(
      "/admin/signature-requests/from-document",
      {
        method: "POST",
        token: getToken(),
        body: JSON.stringify({
          organisationId: orgId,
          sourceDocumentId: documentId,
          title,
        }),
      }
    );
    if (!result.success) {
      setEsignError(result.error.message);
      return;
    }
    if (result.data.reused) {
      setEsignError("");
    }
    setEsignId(result.data.request.id);
  }

  if (!user) return null;

  return (
    <AppShell user={user} nav={adminNav} title="Documents">
      {esignError ? <div className="error-banner">{esignError}</div> : null}
      <section className="panel" style={{ marginBottom: 16 }}>
        <h2>Organisation</h2>
        <p className="lead">Browse folders for any client, including Private Space. Use Request signature on a PDF to place boxes and send.</p>
        <div className="field" style={{ maxWidth: 420, marginBottom: 0 }}>
          <label htmlFor="org">Select company</label>
          <select
            id="org"
            value={orgId}
            onChange={(e) => {
              setOrgId(e.target.value);
              router.replace(`/admin/documents?org=${encodeURIComponent(e.target.value)}`);
            }}
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      <DocumentsPanel
        key={orgId || "none"}
        mode="admin"
        organisationId={orgId || undefined}
        organisationName={orgName}
        onRequestSignature={startEsign}
      />

      {esignId ? (
        <EsignSheet
          role="admin"
          requestId={esignId}
          onClose={() => setEsignId(null)}
        />
      ) : null}
    </AppShell>
  );
}

export default function AdminDocumentsPage() {
  return (
    <Suspense fallback={<main className="auth-shell">Loading…</main>}>
      <AdminDocumentsInner />
    </Suspense>
  );
}
