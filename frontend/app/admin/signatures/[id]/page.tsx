"use client";

import { Suspense, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

function RedirectInner() {
  const params = useParams();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/admin/signatures?open=${encodeURIComponent(String(params.id || ""))}`);
  }, [params.id, router]);
  return <div className="auth-card">Opening signature…</div>;
}

export default function AdminSignatureDetailPage() {
  return (
    <Suspense fallback={<div className="auth-card">Loading…</div>}>
      <RedirectInner />
    </Suspense>
  );
}
