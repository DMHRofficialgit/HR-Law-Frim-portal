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

export default function PortalHomePage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [org, setOrg] = useState<Organisation | null>(null);
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
        const result = await apiFetch<{ organisation: Organisation }>("/client/organisation", {
          token,
        });
        if (!result.success) {
          if (result.error.code === "PASSWORD_CHANGE_REQUIRED") {
            router.replace("/change-password");
            return;
          }
          if (result.error.code === "UNAUTHORIZED" || result.error.code === "FORBIDDEN") {
            clearSession();
            router.replace("/login");
            return;
          }
          setError(result.error.message);
          return;
        }
        setOrg(result.data.organisation);
      } catch {
        setError("Unable to load your organisation.");
      }
    }

    load();
  }, [router]);

  if (!user) return null;

  return (
    <AppShell user={user} nav={clientNav} title="Home">
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="panel" style={{ marginBottom: 16 }}>
        <h2>{org?.name || "Your organisation"}</h2>
        <p className="lead">
          Your company space is ready. Open Documents for policies and contracts
          {org?.onboardingStatus === "in_progress"
            ? ", or My Onboarding for your one-time pack."
            : "."}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/portal/documents" className="btn btn-primary">
            Open documents
          </Link>
          {org?.onboardingStatus === "in_progress" ? (
            <Link href="/portal/onboarding" className="btn btn-secondary">
              My Onboarding
            </Link>
          ) : null}
          <Link href="/portal/cases" className="btn btn-secondary">
            Employment cases
          </Link>
        </div>
      </section>

      {org ? (
        <section className="panel">
          <h2>Details</h2>
          <ul className="org-list">
            <li>
              <div>
                <div className="org-name">Reference</div>
                <div className="org-meta">{org.ref || "—"}</div>
              </div>
            </li>
            <li>
              <div>
                <div className="org-name">Onboarding</div>
                <div className="org-meta">{org.onboardingStatus.replace(/_/g, " ")}</div>
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
