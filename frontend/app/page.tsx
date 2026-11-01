"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, getToken, homeForUser } from "../lib/auth";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    const user = getStoredUser();
    if (token && user) {
      router.replace(homeForUser(user));
    } else {
      router.replace("/login");
    }
  }, [router]);

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="brand-kicker">DM.HR Group</p>
        <h1 className="auth-title">Client Portal</h1>
        <p className="auth-sub">Redirecting…</p>
      </section>
    </main>
  );
}
