"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { PortalSelect } from "../../../components/PortalSelect";
import { ListSkeleton } from "../../../components/Skeleton";
import { apiFetch, type PublicUser } from "../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import { adminNav } from "../../../lib/nav";

type OrgOption = { id: string; name: string };

type PortalUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  organisationId: string | null;
  mustChangePassword: boolean;
  passwordChangedAt?: string | null;
  organisation: { id: string; name: string } | null;
};

type CreateResult = {
  user: PortalUser;
  inviteUrl: string | null;
  temporaryPassword: string | null;
  authMode: string;
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "admin" as "admin" | "client",
    organisationId: "",
    authMode: "invite" as "invite" | "temporary_password",
    temporaryPassword: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const token = getToken();
    const [usersRes, orgsRes] = await Promise.all([
      apiFetch<{ users: PortalUser[] }>("/admin/users", { token }),
      apiFetch<{ organisations: OrgOption[] }>("/admin/organisations", { token }),
    ]);
    if (usersRes.success) setUsers(usersRes.data.users);
    else setError(usersRes.error.message);
    if (orgsRes.success) {
      setOrgs(orgsRes.data.organisations.map((o) => ({ id: o.id, name: o.name })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "admin") {
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
        role: form.role,
        authMode: form.authMode,
      };
      if (form.role === "client") body.organisationId = form.organisationId;
      if (form.authMode === "temporary_password") {
        body.temporaryPassword = form.temporaryPassword;
      }
      const result = await apiFetch<CreateResult>("/admin/users", {
        method: "POST",
        token: getToken(),
        body: JSON.stringify(body),
      });
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      const bits = [`Created ${result.data.user.email}.`];
      if (result.data.inviteUrl) bits.push(`Invite: ${result.data.inviteUrl}`);
      if (result.data.temporaryPassword) {
        bits.push(`Temporary password: ${result.data.temporaryPassword}`);
      }
      setNotice(bits.join(" "));
      setForm({
        name: "",
        email: "",
        role: form.role,
        organisationId: form.organisationId,
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
    const result = await apiFetch<{ user: PortalUser }>(`/admin/users/${u.id}/status`, {
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
    const isReset = Boolean(u.passwordChangedAt);
    if (isReset) {
      const ok = window.confirm(
        `Send a password reset link to ${u.email}? They can choose a new password.`
      );
      if (!ok) return;
    }
    const result = await apiFetch<{
      inviteUrl: string;
      purpose?: "invite" | "reset";
    }>(`/admin/users/${u.id}/invite`, {
      method: "POST",
      token: getToken(),
    });
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    const purpose = result.data.purpose || (isReset ? "reset" : "invite");
    setNotice(
      purpose === "reset"
        ? `Password reset for ${u.email}: ${result.data.inviteUrl}`
        : `Invite for ${u.email}: ${result.data.inviteUrl}`
    );
  }

  if (!user) return null;

  const admins = users.filter((u) => u.role === "admin");
  const companyUsers = users.filter((u) => u.role === "client");

  return (
    <AppShell user={user} nav={adminNav} title="User Management">
      {error ? <div className="error-banner">{error}</div> : null}
      {notice ? <div className="success-banner">{notice}</div> : null}

      <section className="panel" style={{ marginBottom: 16 }}>
        <h2>Create user</h2>
        <p className="lead">
          Add DM.HR admins or company users. Each person logs in with their own email — required for
          per-person e-sign later.
        </p>
        <form onSubmit={onCreate} className="form-grid">
          <div className="field">
            <label>Full name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label>Role</label>
            <PortalSelect
              aria-label="Role"
              value={form.role}
              options={[
                { value: "admin", label: "Admin (DM.HR)" },
                { value: "client", label: "Company user" },
              ]}
              onChange={(role) =>
                setForm((f) => ({ ...f, role: role as "admin" | "client" }))
              }
            />
          </div>
          {form.role === "client" ? (
            <div className="field">
              <label>Organisation</label>
              <PortalSelect
                aria-label="Organisation"
                value={form.organisationId}
                searchable
                required
                name="organisationId"
                placeholder="Select company"
                options={[
                  { value: "", label: "Select company" },
                  ...orgs.map((o) => ({ value: o.id, label: o.name })),
                ]}
                onChange={(organisationId) => setForm((f) => ({ ...f, organisationId }))}
              />
            </div>
          ) : null}
          <div className="field">
            <label>Auth</label>
            <PortalSelect
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
              <label>Temporary password</label>
              <input
                value={form.temporaryPassword}
                onChange={(e) => setForm((f) => ({ ...f, temporaryPassword: e.target.value }))}
                minLength={8}
                required
              />
            </div>
          ) : null}
          <div className="field" style={{ alignSelf: "end" }}>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create user"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <h2>DM.HR admins</h2>
        {loading ? (
          <ListSkeleton rows={3} showAvatar={false} />
        ) : (
          <ul className="org-list">
            {admins.map((u) => (
              <li key={u.id}>
                <div>
                  <div className="org-name">{u.name}</div>
                  <div className="org-meta">
                    {u.email} · {u.status}
                    {u.mustChangePassword ? " · must change password" : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => resendInvite(u)}>
                    {u.passwordChangedAt ? "Password reset" : "Invite link"}
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
        )}
      </section>

      <section className="panel">
        <h2>Company users</h2>
        {loading ? (
          <ListSkeleton rows={4} showAvatar={false} />
        ) : (
          <ul className="org-list">
            {companyUsers.map((u) => (
              <li key={u.id}>
                <div>
                  <div className="org-name">{u.name}</div>
                  <div className="org-meta">
                    {u.email} · {u.organisation?.name || "—"} · {u.status}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => resendInvite(u)}>
                    {u.passwordChangedAt ? "Password reset" : "Invite link"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => toggleStatus(u)}
                  >
                    {u.status === "active" ? "Disable" : "Enable"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
