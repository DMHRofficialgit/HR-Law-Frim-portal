"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { apiFetch, type PublicUser } from "../../lib/api";
import { clearSession, getStoredUser, getToken, homeForUser } from "../../lib/auth";
import { adminNav } from "../../lib/nav";

type OrgRow = {
  id: string;
  name: string;
  ref: string | null;
  onboardingStatus: string;
  status: string;
  users: Array<{
    id: string;
    email: string;
    name: string;
    status: string;
    mustChangePassword: boolean;
  }>;
};

type CreateResult = {
  organisation: { id: string; name: string };
  clientUser: PublicUser;
  authMode: string;
  inviteUrl: string | null;
  temporaryPassword: string | null;
};

const emptyForm = {
  name: "",
  ref: "",
  contactName: "",
  email: "",
  phone: "",
  type: "",
  clientName: "",
  clientEmail: "",
  authMode: "invite" as "invite" | "temporary_password",
  temporaryPassword: "",
  onboardingStatus: "in_progress" as "in_progress" | "existing_skip",
};

export default function AdminOrganisationsPage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadOrgs = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<{ organisations: OrgRow[] }>("/admin/organisations", {
        token,
      });
      if (!result.success) {
        if (result.error.code === "PASSWORD_CHANGE_REQUIRED") {
          router.replace("/change-password");
          return;
        }
        if (result.error.code === "UNAUTHORIZED" || result.error.code === "FORBIDDEN") {
          clearSession();
          router.replace("/login");
          return;
        }
        setError(result.error.message);
        return;
      }
      setOrgs(result.data.organisations);
    } catch {
      setError("Unable to load organisations.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored) {
      router.replace("/login");
      return;
    }
    if (stored.role !== "admin") {
      router.replace(homeForUser(stored));
      return;
    }
    if (stored.mustChangePassword) {
      router.replace("/change-password");
      return;
    }
    setUser(stored);
    loadOrgs();
  }, [router, loadOrgs]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setCreating(true);

    try {
      const payload = {
        name: form.name,
        ref: form.ref || undefined,
        contactName: form.contactName || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        type: form.type || undefined,
        clientName: form.clientName,
        clientEmail: form.clientEmail,
        authMode: form.authMode,
        temporaryPassword:
          form.authMode === "temporary_password" ? form.temporaryPassword : undefined,
        onboardingStatus: form.onboardingStatus,
      };

      const result = await apiFetch<CreateResult>("/admin/organisations", {
        method: "POST",
        token: getToken(),
        body: JSON.stringify(payload),
      });

      if (!result.success) {
        setError(result.error.message);
        return;
      }

      const bits = [`Created ${result.data.organisation.name}.`];
      if (result.data.inviteUrl) bits.push(`Invite link: ${result.data.inviteUrl}`);
      if (result.data.temporaryPassword)
        bits.push(`Temporary password: ${result.data.temporaryPassword}`);
      setNotice(bits.join(" "));
      setForm(emptyForm);
      await loadOrgs();
    } catch {
      setError("Unable to create organisation.");
    } finally {
      setCreating(false);
    }
  }

  if (!user) return null;

  return (
    <AppShell user={user} nav={adminNav} title="Organisations">
      {error ? <div className="error-banner">{error}</div> : null}
      {notice ? <div className="success-banner">{notice}</div> : null}

      <section className="panel" style={{ marginBottom: 20 }}>
        <h2>Add organisation</h2>
        <p className="lead">
          Creates the company, client login, and seven document folders (including My Onboarding).
          Choose whether this is a new client (needs onboarding) or already onboarded.
        </p>

        <form onSubmit={onCreate}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="orgName">Company name</label>
              <input
                id="orgName"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="ref">Reference</label>
              <input
                id="ref"
                value={form.ref}
                onChange={(e) => setForm({ ...form, ref: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="contactName">Contact name</label>
              <input
                id="contactName"
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="orgEmail">Company email</label>
              <input
                id="orgEmail"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="phone">Phone</label>
              <input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="type">Type</label>
              <input
                id="type"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                placeholder="e.g. Adult Social Care"
              />
            </div>
            <div className="field">
              <label htmlFor="clientName">Client login name</label>
              <input
                id="clientName"
                value={form.clientName}
                onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="clientEmail">Client login email</label>
              <input
                id="clientEmail"
                type="email"
                value={form.clientEmail}
                onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="authMode">Access method</label>
              <select
                id="authMode"
                value={form.authMode}
                onChange={(e) =>
                  setForm({
                    ...form,
                    authMode: e.target.value as "invite" | "temporary_password",
                  })
                }
              >
                <option value="invite">Email invite link</option>
                <option value="temporary_password">Temporary password</option>
              </select>
            </div>
            {form.authMode === "temporary_password" ? (
              <div className="field">
                <label htmlFor="tempPassword">Temporary password</label>
                <input
                  id="tempPassword"
                  type="text"
                  value={form.temporaryPassword}
                  onChange={(e) => setForm({ ...form, temporaryPassword: e.target.value })}
                  minLength={8}
                  required
                />
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="onboardingStatus">Onboarding</label>
              <select
                id="onboardingStatus"
                value={form.onboardingStatus}
                onChange={(e) =>
                  setForm({
                    ...form,
                    onboardingStatus: e.target.value as "in_progress" | "existing_skip",
                  })
                }
              >
                <option value="in_progress">Needs onboarding (new client)</option>
                <option value="existing_skip">Already onboarded (skip pack)</option>
              </select>
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={creating}>
            {creating ? "Creating…" : "Create organisation"}
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Organisations</h2>
        <p className="lead">{loading ? "Loading…" : `${orgs.length} company account(s)`}</p>
        <ul className="org-list">
          {orgs.map((org) => {
            const client = org.users[0];
            return (
              <li key={org.id}>
                <div>
                  <div className="org-name">{org.name}</div>
                  <div className="org-meta">
                    {org.ref ? `${org.ref} · ` : ""}
                    Onboarding: {org.onboardingStatus.replace(/_/g, " ")}
                    {client
                      ? ` · ${client.email}${client.mustChangePassword ? " (temp password)" : ""}`
                      : " · no client user"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      router.push(`/admin/documents?org=${encodeURIComponent(org.id)}`)
                    }
                  >
                    Documents
                  </button>
                  {org.onboardingStatus === "in_progress" ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => router.push("/admin/onboarding")}
                    >
                      Onboarding
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </AppShell>
  );
}
