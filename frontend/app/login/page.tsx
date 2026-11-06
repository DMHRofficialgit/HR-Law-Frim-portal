"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthPasswordField } from "../../components/AuthPasswordField";
import { AuthShell } from "../../components/AuthShell";
import { apiFetch, type PublicUser } from "../../lib/api";
import { getToken, homeForUser, saveSession } from "../../lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getToken()) {
      const stored = localStorage.getItem("dmhr_user");
      if (stored) {
        try {
          router.replace(homeForUser(JSON.parse(stored) as PublicUser));
        } catch {
          /* stay on login */
        }
      }
    }
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await apiFetch<{ token: string; user: PublicUser }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      if (!result.success) {
        setError(result.error.message);
        return;
      }

      saveSession(result.data.token, result.data.user);
      router.replace(homeForUser(result.data.user));
    } catch {
      setError("Unable to reach the server. Is the API running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Access your organisation portal securely."
    >
      {error ? <div className="error-banner">{error}</div> : null}

      <form onSubmit={onSubmit} className="auth-form">
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
          />
        </div>
        <AuthPasswordField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Continue"}
        </button>
      </form>
    </AuthShell>
  );
}
