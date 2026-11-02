"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy route — create is a modal on the case register. */
export default function NewCaseRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/portal/cases?create=1");
  }, [router]);
  return (
    <main className="auth-shell">
      <p className="lead">Opening case form…</p>
    </main>
  );
}
