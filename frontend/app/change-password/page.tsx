"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthPasswordField } from "../../components/AuthPasswordField";
import { AuthShell } from "../../components/AuthShell";
import { apiFetch, type AuthBundle, type PublicUser } from "../../lib/api";
import { clearSession, getStoredUser, getToken, homeForUser, saveSession } from "../../lib/auth";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored) {
      router.replace("/login");
      return;
    }
    setUser(stored);
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (newPassword !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const result = await apiFetch<AuthBundle>("/auth/change-password", {
        method: "POST",
        token: getToken(),
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!result.success) {
        setError(result.error.message);
        return;
      }

      saveSession(result.data.token, result.data.user, {
        refreshToken: result.data.refreshToken,
        session: result.data.session,
      });
      router.replace(homeForUser(result.data.user));
    } catch {
      setError("Unable to reach the server.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    const token = getToken();
    if (token) {
      try {
        await apiFetch("/auth/logout", { method: "POST", token });
      } catch {
        /* clear anyway */
      }
    }
    clearSession();
    router.replace("/login");
  }

  if (!user) return null;

  return (
    <AuthShell
      title="Update password"
      subtitle="You signed in with a temporary password. Choose a new one to continue."
      footer={
        <button className="btn btn-ghost btn-sm" type="button" onClick={logout}>
          Sign out
        </button>
      }
    >
      {error ? <div className="error-banner">{error}</div> : null}

      <form onSubmit={onSubmit} className="auth-form">
        <AuthPasswordField
          id="current"
          label="Current password"
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
        />
        <AuthPasswordField
          id="new"
          label="New password"
          value={newPassword}
          onChange={setNewPassword}
          autoComplete="new-password"
          minLength={8}
        />
        <AuthPasswordField
          id="confirm"
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          minLength={8}
        />
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Saving…" : "Save password"}
        </button>
      </form>
    </AuthShell>
  );
}
