"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { DocumentsPanel } from "../../../components/DocumentsPanel";
import { EsignSheet } from "../../../components/EsignSheet";
import { PortalSelect } from "../../../components/PortalSelect";
import { apiFetch, type PublicUser } from "../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import { adminNav } from "../../../lib/nav";
import { isPdfDocument } from "../../../lib/signatures";
import { useToast } from "../../../context/ToastContext";

type OrgOption = { id: string; name: string };

function AdminDocumentsInner() {
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [orgId, setOrgId] = useState("");
  const [esignId, setEsignId] = useState<string | null>(null);

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
    if (!isPdfDocument(mimeType, title)) {
      toast.error("E-sign requires a PDF document.");
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
      toast.error(result.error.message);
      return;
    }
    setEsignId(result.data.request.id);
  }

  if (!user) return null;

  return (
    <AppShell user={user} nav={adminNav} title="Documents">
      <div className="docs-page-toolbar">
        <div className="docs-page-toolbar-main">
          <span id="docs-org-label" className="docs-page-label">
            Company
          </span>
          <PortalSelect
            id="docs-org"
            className="docs-org-select"
            aria-label="Company"
            value={orgId}
            options={orgs.map((o) => ({ value: o.id, label: o.name }))}
            placeholder="Select company…"
            searchable
            onChange={(next) => {
              setOrgId(next);
              router.replace(`/admin/documents?org=${encodeURIComponent(next)}`);
            }}
          />
        </div>
        <p className="docs-page-hint">
          Browse folders · Drop or select files · Request signature on PDFs from the row icons
        </p>
      </div>

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
