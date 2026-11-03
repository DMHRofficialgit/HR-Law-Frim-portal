"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Ban,
  Building2,
  CircleCheck,
  KeyRound,
  Shield,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";
import { AccessCredentialsBanner } from "../../../components/AccessCredentialsBanner";
import { AppShell } from "../../../components/AppShell";
import { PortalSearch } from "../../../components/PortalSearch";
import { PortalSelect } from "../../../components/PortalSelect";
import { RowActionsMenu } from "../../../components/RowActionsMenu";
import { MetricSkeleton, TableSkeleton } from "../../../components/Skeleton";
import { UserFormDialog } from "../../../components/UserFormDialog";
import { useConfirm } from "../../../context/ConfirmContext";
import { useToast } from "../../../context/ToastContext";
import { apiFetch, type PublicUser } from "../../../lib/api";
import {
  storeAccessCredentials,
  type AccessCredentialsPayload,
} from "../../../lib/access-credentials";
import { getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import { adminNav } from "../../../lib/nav";
import {
  countUsersByKpi,
  userAccessActionLabel,
  userAccessLabel,
  userInitials,
  userMatchesKpi,
  userNeedsAccess,
  userRoleLabel,
  userStatusLabel,
  userStatusPillTone,
  type PortalUserRow,
  type UserCreateCredentials,
  type UserKpiKey,
} from "../../../lib/users";

type OrgOption = { id: string; name: string };

function AdminUsersInner() {
  const router = useRouter();
  const search = useSearchParams();
  const orgFromUrl = search.get("org") || "";
  const { confirm } = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();

  const [user, setUser] = useState<PublicUser | null>(null);
  const [users, setUsers] = useState<PortalUserRow[]>([]);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [orgFilter, setOrgFilter] = useState(orgFromUrl);
  const [kpi, setKpi] = useState<UserKpiKey>(orgFromUrl ? "company" : "all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [credentials, setCredentials] = useState<AccessCredentialsPayload | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const token = getToken();
    const [usersRes, orgsRes] = await Promise.all([
      apiFetch<{ users: PortalUserRow[] }>("/admin/users", { token }),
      apiFetch<{ organisations: OrgOption[] }>("/admin/organisations", { token }),
    ]);
    if (usersRes.success) {
      setUsers(usersRes.data.users);
      setError("");
    } else {
      setError(usersRes.error.message);
      toastError(usersRes.error.message);
    }
    if (orgsRes.success) {
      setOrgs(orgsRes.data.organisations.map((o) => ({ id: o.id, name: o.name })));
    }
    setLoading(false);
  }, [toastError]);

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

  useEffect(() => {
    if (orgFromUrl) {
      setOrgFilter(orgFromUrl);
      setKpi("company");
    }
  }, [orgFromUrl]);

  const kpiCounts = useMemo(() => countUsersByKpi(users), [users]);

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return users.filter((u) => {
      if (!userMatchesKpi(u, kpi)) return false;
      if (roleFilter && u.role !== roleFilter) return false;
      if (statusFilter && u.status !== statusFilter) return false;
      if (orgFilter && u.organisationId !== orgFilter && u.organisation?.id !== orgFilter) {
        return false;
      }
      if (!needle) return true;
      const hay = [
        u.name,
        u.email,
        userRoleLabel(u.role),
        userAccessLabel(u),
        userStatusLabel(u.status),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [users, filter, kpi, roleFilter, statusFilter, orgFilter]);

  function onCreated(result: UserCreateCredentials) {
    const orgName =
      result.user.organisation?.name ||
      orgs.find((o) => o.id === result.user.organisationId)?.name ||
      (result.user.role === "admin" ? "DM.HR Group" : "Company");
    const payload: AccessCredentialsPayload = {
      organisationId: result.user.organisationId || result.user.organisation?.id || "firm",
      organisationName: orgName,
      clientEmail: result.user.email,
      clientName: result.user.name,
      authMode: result.authMode,
      purpose: "invite",
      inviteUrl: result.inviteUrl,
      temporaryPassword: result.temporaryPassword,
      mailStatus: result.mailStatus || "skipped",
      createdAt: new Date().toISOString(),
    };
    storeAccessCredentials(payload);
    setCredentials(payload);
    toastSuccess(`Created ${result.user.email}`);
    load();
  }

  async function toggleStatus(u: PortalUserRow) {
    const next = u.status === "active" ? "disabled" : "active";
    if (next === "disabled") {
      const ok = await confirm({
        title: `Disable ${u.name}?`,
        description: "They will not be able to sign in until enabled again.",
        confirmLabel: "Disable",
        tone: "danger",
      });
      if (!ok) return;
    }
    setBusyId(u.id);
    const result = await apiFetch<{ user: PortalUserRow }>(`/admin/users/${u.id}/status`, {
      method: "PATCH",
      token: getToken(),
      body: JSON.stringify({ status: next }),
    });
    setBusyId(null);
    if (!result.success) {
      toastError(result.error.message);
      return;
    }
    toastSuccess(`${u.email} is now ${next}`);
    await load();
  }

  async function resendInvite(u: PortalUserRow) {
    const isReset = Boolean(u.passwordChangedAt);
    if (isReset) {
      const ok = await confirm({
        title: "Send password reset?",
        description: `Send a password reset link to ${u.email}?`,
        confirmLabel: "Send reset",
      });
      if (!ok) return;
    }
    setBusyId(u.id);
    const result = await apiFetch<{
      inviteUrl: string;
      purpose?: "invite" | "reset";
      mailStatus?: string;
    }>(`/admin/users/${u.id}/invite`, {
      method: "POST",
      token: getToken(),
    });
    setBusyId(null);
    if (!result.success) {
      toastError(result.error.message);
      return;
    }
    const purpose = result.data.purpose || (isReset ? "reset" : "invite");
    const payload: AccessCredentialsPayload = {
      organisationId: u.organisationId || u.organisation?.id || "firm",
      organisationName: u.organisation?.name || "DM.HR Group",
      clientEmail: u.email,
      clientName: u.name,
      authMode: "invite",
      purpose,
      inviteUrl: result.data.inviteUrl,
      temporaryPassword: null,
      mailStatus: result.data.mailStatus || "skipped",
      createdAt: new Date().toISOString(),
    };
    storeAccessCredentials(payload);
    setCredentials(payload);
    toastSuccess(purpose === "reset" ? "Password reset link ready" : "Invite link refreshed");
  }

  if (!user) return null;

  const kpiCards: Array<{
    key: UserKpiKey;
    label: string;
    hint: string;
    icon: typeof Users;
  }> = [
    { key: "all", label: "All users", hint: "Admins and company logins", icon: Users },
    { key: "admins", label: "DM.HR admins", hint: "Firm administrators", icon: Shield },
    { key: "company", label: "Company users", hint: "Client organisation logins", icon: UserCog },
    { key: "needs_access", label: "Needs access", hint: "Invite pending or must set password", icon: KeyRound },
  ];

  return (
    <AppShell user={user} nav={adminNav} title="User Management">
      {error ? <div className="error-banner">{error}</div> : null}

      {credentials ? (
        <div style={{ marginBottom: 16 }}>
          <AccessCredentialsBanner
            credentials={credentials}
            onDismiss={() => setCredentials(null)}
          />
        </div>
      ) : null}

      {loading ? (
        <MetricSkeleton count={4} />
      ) : (
        <div className="metrics-row case-metrics-row" role="group" aria-label="User summary">
          {kpiCards.map(({ key, label, hint, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={`metric-card metric-card-link case-metric-card${
                kpi === key ? " is-active" : ""
              }`}
              onClick={() => setKpi((prev) => (prev === key && key !== "all" ? "all" : key))}
              aria-pressed={kpi === key}
            >
              <Icon className="case-metric-icon" size={16} strokeWidth={1.75} aria-hidden />
              <div className="metric-value">{kpiCounts[key]}</div>
              <div className="metric-label">{label}</div>
              <p className="metric-hint">{hint}</p>
            </button>
          ))}
        </div>
      )}

      <section className="panel org-directory">
        <div className="org-directory-head">
          <div>
            <h2>Users</h2>
            <p className="lead">
              {loading
                ? "…"
                : `${filtered.length} user${filtered.length === 1 ? "" : "s"}`}
              {!loading && users.length !== filtered.length ? ` · ${users.length} total` : ""}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setDialogOpen(true)}
          >
            <UserPlus size={14} strokeWidth={1.75} aria-hidden />
            Create user
          </button>
        </div>

        <div className="org-toolbar org-directory-toolbar">
          <div className="org-toolbar-search">
            <PortalSearch
              mode="inline"
              nav={adminNav}
              role="admin"
              value={filter}
              onQueryChange={setFilter}
              placeholder="Search name, email, or company…"
              aria-label="Filter users"
            />
          </div>
          <PortalSelect
            className="org-filter"
            size="sm"
            aria-label="Filter by role"
            value={roleFilter}
            options={[
              { value: "", label: "All roles" },
              { value: "admin", label: "Admin" },
              { value: "client", label: "Company user" },
            ]}
            onChange={setRoleFilter}
          />
          <PortalSelect
            className="org-filter"
            size="sm"
            aria-label="Filter by status"
            value={statusFilter}
            options={[
              { value: "", label: "All statuses" },
              { value: "active", label: "Active" },
              { value: "disabled", label: "Disabled" },
            ]}
            onChange={setStatusFilter}
          />
          <PortalSelect
            className="org-filter"
            size="sm"
            aria-label="Filter organisation"
            value={orgFilter}
            searchable
            options={[
              { value: "", label: "All organisations" },
              ...orgs.map((o) => ({ value: o.id, label: o.name })),
            ]}
            onChange={setOrgFilter}
          />
        </div>

        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p>
              {users.length === 0
                ? "No users yet."
                : "No users match these filters."}
            </p>
            <p className="lead">
              Create a DM.HR admin or add a login for a client company.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setDialogOpen(true)}
            >
              Create user
            </button>
          </div>
        ) : (
          <div className="table-wrap directory-table-scroll">
            <table className="data-table org-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Access</th>
                  <th>Status</th>
                  <th className="org-table-actions-col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const isSelf = u.id === user.id;
                  return (
                    <tr key={u.id} className={u.status !== "active" ? "is-inactive" : undefined}>
                      <td>
                        <div className="org-table-company">
                          <span className="org-table-avatar" aria-hidden>
                            {userInitials(u.name)}
                          </span>
                          <div>
                            <div className="primary-cell">
                              {u.name}
                              {isSelf ? (
                                <span className="user-you-pill">You</span>
                              ) : null}
                              {userNeedsAccess(u) ? (
                                <span className="esign-queue-badge needs-you" style={{ marginLeft: 6 }}>
                                  Needs access
                                </span>
                              ) : null}
                            </div>
                            <div className="secondary-cell">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="org-table-muted">{userRoleLabel(u.role)}</span>
                      </td>
                      <td>
                        {u.role === "client" && (u.organisationId || u.organisation?.id) ? (
                          <Link
                            href={`/admin/organisations/${u.organisationId || u.organisation?.id}`}
                            className="org-table-muted"
                            style={{ textDecoration: "underline" }}
                          >
                            {userAccessLabel(u)}
                          </Link>
                        ) : (
                          <span className="org-table-muted">{userAccessLabel(u)}</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`status-pill status-pill-${userStatusPillTone(u.status)}`}
                        >
                          {userStatusLabel(u.status)}
                        </span>
                      </td>
                      <td className="org-table-actions-col">
                        <RowActionsMenu
                          label={`Actions for ${u.name}`}
                          items={[
                            {
                              id: "access",
                              label: userAccessActionLabel(u),
                              icon: <KeyRound size={14} strokeWidth={1.75} />,
                              disabled: busyId === u.id,
                              onSelect: () => resendInvite(u),
                            },
                            ...(u.role === "client" &&
                            (u.organisationId || u.organisation?.id)
                              ? [
                                  {
                                    id: "org",
                                    label: "Open organisation",
                                    icon: <Building2 size={14} strokeWidth={1.75} />,
                                    onSelect: () =>
                                      router.push(
                                        `/admin/organisations/${
                                          u.organisationId || u.organisation?.id
                                        }`
                                      ),
                                  },
                                ]
                              : []),
                            {
                              id: "toggle",
                              label: u.status === "active" ? "Disable" : "Enable",
                              icon:
                                u.status === "active" ? (
                                  <Ban size={14} strokeWidth={1.75} />
                                ) : (
                                  <CircleCheck size={14} strokeWidth={1.75} />
                                ),
                              tone:
                                u.status === "active"
                                  ? ("danger" as const)
                                  : ("default" as const),
                              disabled: isSelf || busyId === u.id,
                              separatorBefore: true,
                              onSelect: () => toggleStatus(u),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <UserFormDialog
        open={dialogOpen}
        scope="admin"
        orgs={orgs}
        initialOrganisationId={orgFilter || orgFromUrl}
        onClose={() => setDialogOpen(false)}
        onCreated={onCreated}
      />
    </AppShell>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<main className="auth-shell">Loading…</main>}>
      <AdminUsersInner />
    </Suspense>
  );
}
