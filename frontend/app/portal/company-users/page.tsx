"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, CircleCheck, KeyRound, UserPlus, Users } from "lucide-react";
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
import { clientNav } from "../../../lib/nav";
import {
  countClientUsersByKpi,
  clientUserMatchesKpi,
  userAccessActionLabel,
  userInitials,
  userNeedsAccess,
  userStatusLabel,
  userStatusPillTone,
  type ClientUserKpiKey,
  type PortalUserRow,
  type UserCreateCredentials,
} from "../../../lib/users";

export default function CompanyUsersPage() {
  const router = useRouter();
  const { confirm } = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();

  const [user, setUser] = useState<PublicUser | null>(null);
  const [users, setUsers] = useState<PortalUserRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [kpi, setKpi] = useState<ClientUserKpiKey>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [credentials, setCredentials] = useState<AccessCredentialsPayload | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await apiFetch<{ users: PortalUserRow[] }>("/client/users", {
      token: getToken(),
    });
    if (result.success) {
      setUsers(result.data.users);
      setError("");
    } else {
      setError(result.error.message);
      toastError(result.error.message);
    }
    setLoading(false);
  }, [toastError]);

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

  const kpiCounts = useMemo(() => countClientUsersByKpi(users), [users]);

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return users.filter((u) => {
      if (!clientUserMatchesKpi(u, kpi)) return false;
      if (statusFilter && u.status !== statusFilter) return false;
      if (!needle) return true;
      const hay = [u.name, u.email, userStatusLabel(u.status)].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [users, filter, kpi, statusFilter]);

  function onCreated(result: UserCreateCredentials) {
    const payload: AccessCredentialsPayload = {
      organisationId: user?.organisationId || "org",
      organisationName: "Your company",
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
    toastSuccess(`Added ${result.user.email}`);
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
    const result = await apiFetch<{ user: PortalUserRow }>(`/client/users/${u.id}/status`, {
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
    }>(`/client/users/${u.id}/invite`, {
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
      organisationId: user?.organisationId || "org",
      organisationName: "Your company",
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
    key: ClientUserKpiKey;
    label: string;
    hint: string;
    icon: typeof Users;
  }> = [
    { key: "all", label: "All", hint: "Everyone in your company", icon: Users },
    { key: "needs_access", label: "Needs access", hint: "Invite pending or must set password", icon: KeyRound },
    { key: "active", label: "Active", hint: "Can sign in", icon: CircleCheck },
  ];

  return (
    <AppShell user={user} nav={clientNav} title="Company Users">
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
        <MetricSkeleton count={3} />
      ) : (
        <div className="metrics-row case-metrics-row" role="group" aria-label="Company users summary">
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
            <h2>Users in your company</h2>
            <p className="lead">
              {loading
                ? "…"
                : `${filtered.length} user${filtered.length === 1 ? "" : "s"}`}
              {!loading && users.length !== filtered.length ? ` · ${users.length} total` : ""}
              {" · "}
              Each login can be assigned e-sign fields later.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setDialogOpen(true)}
          >
            <UserPlus size={14} strokeWidth={1.75} aria-hidden />
            Add company user
          </button>
        </div>

        <div className="org-toolbar org-directory-toolbar">
          <div className="org-toolbar-search">
            <PortalSearch
              mode="inline"
              nav={clientNav}
              role="client"
              value={filter}
              onQueryChange={setFilter}
              placeholder="Search name or email…"
              aria-label="Filter company users"
            />
          </div>
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
        </div>

        {loading ? (
          <TableSkeleton rows={5} cols={3} />
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p>
              {users.length === 0
                ? "No company users yet."
                : "No users match these filters."}
            </p>
            <p className="lead">Add a colleague so they can sign in with their own email.</p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setDialogOpen(true)}
            >
              Add company user
            </button>
          </div>
        ) : (
          <div className="table-wrap directory-table-scroll">
            <table className="data-table org-table">
              <thead>
                <tr>
                  <th>User</th>
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
                                <span
                                  className="esign-queue-badge needs-you"
                                  style={{ marginLeft: 6 }}
                                >
                                  Needs access
                                </span>
                              ) : null}
                            </div>
                            <div className="secondary-cell">{u.email}</div>
                          </div>
                        </div>
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
                            {
                              id: "toggle",
                              label: u.status === "active" ? "Disable" : "Enable",
                              icon:
                                u.status === "active" ? (
                                  <Ban size={14} strokeWidth={1.75} />
                                ) : (
                                  <CircleCheck size={14} strokeWidth={1.75} />
                                ),
                              tone: u.status === "active" ? "danger" : "default",
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
        scope="client"
        onClose={() => setDialogOpen(false)}
        onCreated={onCreated}
      />
    </AppShell>
  );
}
