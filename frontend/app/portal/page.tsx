"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { apiFetch, type PublicUser } from "../../lib/api";
import { clearSession, getStoredUser, getToken, homeForUser } from "../../lib/auth";
import { clientNav } from "../../lib/nav";

type Organisation = {
  id: string;
  name: string;
  ref: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  type: string | null;
  onboardingStatus: string;
  status: string;
};

type CaseRow = {
  id: string;
  status: string;
};

type DocFolder = {
  id: string;
  name: string;
};

export default function PortalHomePage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [org, setOrg] = useState<Organisation | null>(null);
  const [openCases, setOpenCases] = useState(0);
  const [folderCount, setFolderCount] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored) {
      router.replace("/login");
      return;
    }
    if (stored.role !== "client") {
      router.replace(homeForUser(stored));
      return;
    }
    if (stored.mustChangePassword) {
      router.replace("/change-password");
      return;
    }
    setUser(stored);

    async function load() {
      try {
        const [orgRes, casesRes, docsRes] = await Promise.all([
          apiFetch<{ organisation: Organisation }>("/client/organisation", { token }),
          apiFetch<{ cases: CaseRow[] }>("/client/cases", { token }),
          apiFetch<{ folders: DocFolder[] }>("/client/folders", { token }),
        ]);

        if (!orgRes.success) {
          if (orgRes.error.code === "PASSWORD_CHANGE_REQUIRED") {
            router.replace("/change-password");
            return;
          }
          if (orgRes.error.code === "UNAUTHORIZED" || orgRes.error.code === "FORBIDDEN") {
            clearSession();
            router.replace("/login");
            return;
          }
          setError(orgRes.error.message);
          return;
        }
        setOrg(orgRes.data.organisation);

        if (casesRes.success) {
          setOpenCases(casesRes.data.cases.filter((c) => c.status !== "closed").length);
        }

        if (docsRes.success) setFolderCount(docsRes.data.folders.length);
      } catch {
        setError("Unable to load your organisation.");
      }
    }

    load();
  }, [router]);

  if (!user) return null;

  const onboardingActive = org?.onboardingStatus === "in_progress";

  return (
    <AppShell
      user={user}
      nav={clientNav}
      title="Overview"
      actions={
        <Link href="/portal/cases?create=1" className="btn btn-primary btn-sm">
          Submit a case
        </Link>
      }
    >
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="panel" style={{ marginBottom: 16 }}>
        <p className="brand-kicker" style={{ marginBottom: 8 }}>
          Your DM.HR client portal
        </p>
        <h2 style={{ marginTop: 0 }}>Welcome back{org?.name ? `, ${org.name}` : ""}</h2>
        <p className="lead">
          Access documents, keep onboarding moving, update employees, and follow employment cases
          with DM.HR Group.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/portal/cases" className="btn btn-primary">
            View my cases
          </Link>
          <Link href="/portal/documents" className="btn btn-secondary">
            Open documents
          </Link>
          {onboardingActive ? (
            <Link href="/portal/onboarding" className="btn btn-secondary">
              My Onboarding
            </Link>
          ) : null}
        </div>
      </section>

      <div className="metrics-row">
        <div className="metric-card">
          <div className="metric-value">{folderCount || 7}</div>
          <div className="metric-label">Document spaces</div>
          <p className="metric-hint">Folders in your company workspace</p>
        </div>
        <div className="metric-card">
          <div className="metric-value">{openCases}</div>
          <div className="metric-label">Open cases</div>
          <p className="metric-hint">Track updates and next steps</p>
        </div>
        <div className="metric-card">
          <div className="metric-value">{onboardingActive ? "Live" : "Done"}</div>
          <div className="metric-label">Onboarding</div>
          <p className="metric-hint">
            {onboardingActive ? "One-time pack in progress" : "Onboarding complete or skipped"}
          </p>
        </div>
        <div className="metric-card">
          <div className="metric-value">{org?.status === "active" ? "Active" : org?.status || "—"}</div>
          <div className="metric-label">Account status</div>
          <p className="metric-hint">{org?.ref || "Company workspace"}</p>
        </div>
      </div>

      <section className="panel" style={{ marginBottom: 16 }}>
        <h2>Your workspace</h2>
        <p className="lead">Jump into the spaces you use most.</p>
        <div className="overview-doc-grid">
          <Link href="/portal/documents" className="overview-quick-tile">
            <strong>Documents</strong>
            <span>Policies, handbook, HR files, and Private Space</span>
          </Link>
          <Link href="/portal/employees" className="overview-quick-tile">
            <strong>Employees</strong>
            <span>Keep staff records up to date with DM.HR</span>
          </Link>
          <Link href="/portal/cases" className="overview-quick-tile">
            <strong>Employment cases</strong>
            <span>Submit and follow case progress</span>
          </Link>
          <Link href="/portal/signatures" className="overview-quick-tile">
            <strong>Signatures</strong>
            <span>Items waiting for your e-sign</span>
          </Link>
          {onboardingActive ? (
            <Link href="/portal/onboarding" className="overview-quick-tile">
              <strong>My Onboarding</strong>
              <span>One-time pack to complete with DM.HR</span>
            </Link>
          ) : null}
          <Link href="/portal/company-users" className="overview-quick-tile">
            <strong>Company users</strong>
            <span>Invite colleagues to this organisation</span>
          </Link>
        </div>
      </section>

      {org ? (
        <section className="panel">
          <h2>Company details</h2>
          <ul className="org-list">
            <li>
              <div>
                <div className="org-name">Reference</div>
                <div className="org-meta">{org.ref || "—"}</div>
              </div>
            </li>
            <li>
              <div>
                <div className="org-name">Contact</div>
                <div className="org-meta">
                  {org.contactName || "—"}
                  {org.email ? ` · ${org.email}` : ""}
                  {org.phone ? ` · ${org.phone}` : ""}
                </div>
              </div>
            </li>
            <li>
              <div>
                <div className="org-name">Type</div>
                <div className="org-meta">{org.type || "—"}</div>
              </div>
            </li>
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}
