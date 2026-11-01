"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, type PublicUser } from "../../lib/api";
import { homeForUser, saveSession } from "../../lib/auth";

function SetPasswordForm() {
  const router = useRouter();
  const search = useSearchParams();
  const token = search.get("token") || "";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadInvite() {
      if (!token) {
        setError("Invite link is missing a token.");
        setChecking(false);
        return;
      }

      try {
        const result = await apiFetch<{ email: string; name: string }>(
          `/auth/invite/${encodeURIComponent(token)}`
        );
        if (cancelled) return;
        if (!result.success) {
          setError(result.error.message);
          setValid(false);
        } else {
          setEmail(result.data.email);
          setName(result.data.name);
          setValid(true);
        }
      } catch {
        if (!cancelled) setError("Unable to validate invite link.");
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    loadInvite();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const result = await apiFetch<{ token: string; user: PublicUser }>("/auth/set-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });

      if (!result.success) {
        setError(result.error.message);
        return;
      }

      saveSession(result.data.token, result.data.user);
      router.replace(homeForUser(result.data.user));
    } catch {
      setError("Unable to reach the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <img src="/logo/dmhr_transparent_logo.png" alt="DMHR Group" className="auth-logo" />
        <p className="brand-kicker">DMHR Group</p>
        <h1 className="auth-title">Set password</h1>
        <p className="auth-sub">
          {checking
            ? "Validating your invite…"
            : name
              ? `Welcome, ${name}. Choose a password for ${email}.`
              : "Create a password to access your portal."}
        </p>

        {error ? <div className="error-banner">{error}</div> : null}

        {!checking && valid ? (
          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="password">New password</label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="confirm">Confirm password</label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading || !token}>
              {loading ? "Saving…" : "Save and continue"}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="auth-shell">
          <section className="auth-card">
            <p className="brand-kicker">DM.HR Group</p>
            <h1 className="auth-title">Set password</h1>
            <p className="auth-sub">Loading…</p>
          </section>
        </main>
      }
    >
      <SetPasswordForm />
    </Suspense>
  );
}
