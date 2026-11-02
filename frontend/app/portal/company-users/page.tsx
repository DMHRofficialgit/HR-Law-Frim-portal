"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { PortalSelect } from "../../../components/PortalSelect";
import { apiFetch, type PublicUser } from "../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import { clientNav } from "../../../lib/nav";

type PortalUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  mustChangePassword: boolean;
};

type CreateResult = {
  user: PortalUser;
  inviteUrl: string | null;
  temporaryPassword: string | null;
  authMode: string;
};

export default function CompanyUsersPage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: "",
    email: "",
    authMode: "invite" as "invite" | "temporary_password",
    temporaryPassword: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const result = await apiFetch<{ users: PortalUser[] }>("/client/users", {
      token: getToken(),
    });
    if (result.success) {
      setUsers(result.data.users);
      setError("");
    } else {
      setError(result.error.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "client") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    if (stored.mustChangePassword) {
      router.replace("/change-password");
      return;
    }
    setUser(stored);
    load();
  }, [router, load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        authMode: form.authMode,
      };
      if (form.authMode === "temporary_password") {
        body.temporaryPassword = form.temporaryPassword;
      }
      const result = await apiFetch<CreateResult>("/client/users", {
        method: "POST",
        token: getToken(),
        body: JSON.stringify(body),
      });
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      const bits = [`Added ${result.data.user.email}.`];
      if (result.data.inviteUrl) bits.push(`Invite: ${result.data.inviteUrl}`);
      if (result.data.temporaryPassword) {
        bits.push(`Temporary password: ${result.data.temporaryPassword}`);
      }
      setNotice(bits.join(" "));
      setForm({
        name: "",
        email: "",
        authMode: "invite",
        temporaryPassword: "",
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(u: PortalUser) {
    setError("");
    setNotice("");
    const next = u.status === "active" ? "disabled" : "active";
    const result = await apiFetch<{ user: PortalUser }>(`/client/users/${u.id}/status`, {
      method: "PATCH",
      token: getToken(),
      body: JSON.stringify({ status: next }),
    });
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setNotice(`${u.email} is now ${next}.`);
    await load();
  }

  async function resendInvite(u: PortalUser) {
    setError("");
    setNotice("");
    const result = await apiFetch<{ inviteUrl: string }>(`/client/users/${u.id}/invite`, {
      method: "POST",
      token: getToken(),
    });
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setNotice(`Invite for ${u.email}: ${result.data.inviteUrl}`);
  }

  if (!user) return null;

  return (
    <AppShell user={user} nav={clientNav} title="Company Users">
      {error ? <div className="error-banner">{error}</div> : null}
      {notice ? <div className="success-banner">{notice}</div> : null}

      <section className="panel" style={{ marginBottom: 16 }}>
        <h2>Invite a colleague</h2>
        <p className="lead">
          Each person uses their own email login. Later, signature boxes can be assigned to specific
          users.
        </p>
        <form onSubmit={onCreate} className="form-grid">
          <div className="field">
            <label htmlFor="cu-name">Full name</label>
            <input
              id="cu-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="cu-email">Email</label>
            <input
              id="cu-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="cu-auth">Auth</label>
            <PortalSelect
              id="cu-auth"
              aria-label="Auth"
              value={form.authMode}
              options={[
                { value: "invite", label: "Invite link" },
                { value: "temporary_password", label: "Temporary password" },
              ]}
              onChange={(authMode) =>
                setForm((f) => ({
                  ...f,
                  authMode: authMode as "invite" | "temporary_password",
                }))
              }
            />
          </div>
          {form.authMode === "temporary_password" ? (
            <div className="field">
              <label htmlFor="cu-temp">Temporary password</label>
              <input
                id="cu-temp"
                value={form.temporaryPassword}
                onChange={(e) => setForm((f) => ({ ...f, temporaryPassword: e.target.value }))}
                minLength={8}
                required
              />
            </div>
          ) : null}
          <div className="field" style={{ alignSelf: "end" }}>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? "Creating…" : "Add company user"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>Users in your company</h2>
        {loading ? <p className="lead">Loading…</p> : null}
        {!loading && users.length === 0 ? (
          <p className="org-meta">No users found.</p>
        ) : null}
        <ul className="org-list">
          {users.map((u) => (
            <li key={u.id}>
              <div>
                <div className="org-name">{u.name}</div>
                <div className="org-meta">
                  {u.email} · {u.status}
                  {u.mustChangePassword ? " · must change password" : ""}
                  {u.id === user.id ? " · you" : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => resendInvite(u)}>
                  Invite link
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => toggleStatus(u)}
                  disabled={u.id === user.id}
                >
                  {u.status === "active" ? "Disable" : "Enable"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
