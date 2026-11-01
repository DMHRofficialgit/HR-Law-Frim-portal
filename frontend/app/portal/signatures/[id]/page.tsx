"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "../../../../components/AppShell";
import { EsignSheet } from "../../../../components/EsignSheet";
import { type PublicUser } from "../../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../../lib/auth";
import { clientNav } from "../../../../lib/nav";

function ClientSignatureDetailInner() {
  const params = useParams();
  const id = String(params.id || "");
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "client") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
  }, [router]);

  if (!user) return null;

  return (
    <AppShell user={user} nav={clientNav} title="Sign document">
      <EsignSheet
        role="client"
        requestId={id}
        onClose={() => router.push("/portal/signatures")}
        onChanged={() => undefined}
      />
    </AppShell>
  );
}

export default function ClientSignatureDetailPage() {
  return (
    <Suspense fallback={<div className="auth-card">Loading…</div>}>
      <ClientSignatureDetailInner />
    </Suspense>
  );
}
