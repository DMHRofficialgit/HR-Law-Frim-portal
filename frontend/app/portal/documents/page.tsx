"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { DocumentsPanel } from "../../../components/DocumentsPanel";
import type { PublicUser } from "../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import { clientNav } from "../../../lib/nav";

function PortalDocumentsInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [user, setUser] = useState<PublicUser | null>(null);
  const preferredFolderKey = search.get("folder");

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
  }, [router]);

  if (!user) return null;

  return (
    <AppShell user={user} nav={clientNav} title="Documents">
      <DocumentsPanel mode="client" preferredFolderKey={preferredFolderKey} />
    </AppShell>
  );
}

export default function PortalDocumentsPage() {
  return (
    <Suspense fallback={<main className="auth-shell">Loading…</main>}>
      <PortalDocumentsInner />
    </Suspense>
  );
}
