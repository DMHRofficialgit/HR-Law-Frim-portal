"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthPasswordField } from "../../components/AuthPasswordField";
import { AuthShell } from "../../components/AuthShell";
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

  const subtitle = checking
    ? "Validating your invite…"
    : name
      ? `Welcome, ${name}. Choose a password for ${email}.`
      : "Create a password to access your portal.";

  return (
    <AuthShell
      title="Set password"
      subtitle={subtitle}
      footer={
        !valid && !checking ? (
          <Link href="/login" className="btn btn-ghost btn-sm">
            Back to sign in
          </Link>
        ) : null
      }
    >
      {error ? <div className="error-banner">{error}</div> : null}

      {!checking && valid ? (
        <form onSubmit={onSubmit} className="auth-form">
          <AuthPasswordField
            id="password"
            label="New password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            minLength={8}
          />
          <AuthPasswordField
            id="confirm"
            label="Confirm password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            minLength={8}
          />
          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading || !token}
          >
            {loading ? "Saving…" : "Save and continue"}
          </button>
        </form>
      ) : null}
    </AuthShell>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Set password" subtitle="Loading…">
          <p className="lead" style={{ margin: 0 }}>
            Please wait…
          </p>
        </AuthShell>
      }
    >
      <SetPasswordForm />
    </Suspense>
  );
}
