"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck, FolderKanban } from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { apiFetch, type PublicUser } from "../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import { adminNav } from "../../../lib/nav";

export default function AdminFirmLibraryLandingPage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [templateCount, setTemplateCount] = useState<number | null>(null);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "admin") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
    void (async () => {
      const result = await apiFetch<{ documents: unknown[] }>("/admin/firm-library", { token });
      if (result.success) setTemplateCount(result.data.documents.length);
    })();
  }, [router]);

  if (!user) return null;

  return (
    <AppShell user={user} nav={adminNav} title="Firm Library">
      <section className="panel" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 6px", fontSize: "1.2rem", letterSpacing: "-0.02em" }}>
          Firm Library
        </h1>
        <p className="lead" style={{ margin: 0 }}>
          Admin templates and firm staging. Onboarding pack powers issue → My Onboarding. Firm
          staging copies reusable files into client Documents.
        </p>
      </section>

      <div className="firm-lib-rooms" role="navigation" aria-label="Firm Library rooms">
        <Link href="/admin/firm-library/onboarding" className="firm-lib-room">
          <span className="firm-lib-room-icon" aria-hidden>
            <ClipboardCheck size={22} strokeWidth={1.75} />
          </span>
          <strong>Onboarding pack</strong>
          <span>
            Terms, Welcome, Compliance templates · boxes + Admin ink · issue from Onboarding
            {templateCount !== null ? ` · ${templateCount} template${templateCount === 1 ? "" : "s"}` : ""}
          </span>
        </Link>

        <Link href="/admin/firm-library/staging" className="firm-lib-room">
          <span className="firm-lib-room-icon" aria-hidden>
            <FolderKanban size={22} strokeWidth={1.75} />
          </span>
          <strong>Firm staging</strong>
          <span>
            Firm folder vault · copy files into any of the six client Documents folders
          </span>
        </Link>
      </div>
    </AppShell>
  );
}
