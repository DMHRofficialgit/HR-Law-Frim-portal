"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { AddOrganisationDialog } from "../../../components/AddOrganisationDialog";
import { PortalSearch } from "../../../components/PortalSearch";
import { RowActionsMenu } from "../../../components/RowActionsMenu";
import { useToast } from "../../../context/ToastContext";
import {
  mailStatusLabel,
  storeAccessCredentials,
} from "../../../lib/access-credentials";
import { apiFetch, type PublicUser } from "../../../lib/api";
import { clearSession, getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import { adminNav } from "../../../lib/nav";
import {
  ORG_REGULATORY_OPTIONS,
  ORG_TYPE_OPTIONS,
  clientAccessAction,
  clientAccessActionLabel,
  orgInitials,
  orgOnboardingSummary,
  orgStatusLabel,
  type OrgListRow,
} from "../../../lib/organisations";

export default function AdminOrganisationsPage() {
  const router = useRouter();
  const toast = useToast();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [orgs, setOrgs] = useState<OrgListRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [contextFilter, setContextFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadOrgs = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<{ organisations: OrgListRow[] }>("/admin/organisations", {
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#add-organisation") setAddOpen(true);
  }, [user]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return orgs.filter((org) => {
      if (statusFilter && org.status !== statusFilter) return false;
      if (typeFilter && (org.type || "") !== typeFilter) return false;
      if (contextFilter && (org.regulatoryContext || "") !== contextFilter) return false;
      if (!q) return true;
      const client = org.users[0];
      return [
        org.name,
        org.ref,
        org.contactName,
        org.email,
        org.type,
        org.regulatoryContext,
        client?.email,
        client?.name,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [orgs, filter, statusFilter, typeFilter, contextFilter]);

  const typeOptions = useMemo(() => {
    const fromData = orgs.map((o) => o.type).filter(Boolean) as string[];
    return [...new Set([...ORG_TYPE_OPTIONS, ...fromData])].sort();
  }, [orgs]);

  const contextOptions = useMemo(() => {
    const fromData = orgs
      .map((o) => o.regulatoryContext)
      .filter(Boolean) as string[];
    return [...new Set([...ORG_REGULATORY_OPTIONS, ...fromData])].sort();
  }, [orgs]);

  async function setOrgStatus(org: OrgListRow, status: "active" | "inactive") {
    setBusyId(org.id);
    try {
      const result = await apiFetch<{ organisation: OrgListRow }>(
        `/admin/organisations/${org.id}`,
        {
          method: "PATCH",
          token: getToken(),
          body: JSON.stringify({ status }),
        }
      );
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      toast.success(
        status === "inactive"
          ? `${org.name} deactivated.`
          : `${org.name} activated.`
      );
      await loadOrgs();
    } catch {
      toast.error("Unable to update organisation status.");
    } finally {
      setBusyId(null);
    }
  }

  async function sendClientAccessLink(org: OrgListRow) {
    const primary = org.users[0];
    if (!primary || primary.status !== "active") {
      toast.error("No active client login.");
      return;
    }
    const action = clientAccessAction(primary);
    if (action === "reset") {
      const ok = window.confirm(
        `Send a password reset link to ${primary.email}? They can choose a new password.`
      );
      if (!ok) return;
    }
    setBusyId(org.id);
    try {
      const result = await apiFetch<{
        inviteUrl: string;
        mailStatus?: string;
        purpose?: "invite" | "reset";
      }>(`/admin/users/${primary.id}/invite`, {
        method: "POST",
        token: getToken(),
      });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      const mailStatus = result.data.mailStatus || "skipped";
      const purpose = result.data.purpose || action;
      storeAccessCredentials({
        organisationId: org.id,
        organisationName: org.name,
        clientEmail: primary.email,
        clientName: primary.name,
        authMode: "invite",
        purpose,
        inviteUrl: result.data.inviteUrl,
        temporaryPassword: null,
        mailStatus,
        createdAt: new Date().toISOString(),
      });
      toast.success(
        purpose === "reset"
          ? `Password reset sent for ${primary.email}.`
          : `Invite refreshed for ${primary.email}.`
      );
      if (mailStatus === "sent") toast.success(mailStatusLabel(mailStatus));
      else if (mailStatus === "failed") toast.error(mailStatusLabel(mailStatus));
      else toast.info(mailStatusLabel(mailStatus));
      router.push(`/admin/organisations/${org.id}`);
    } catch {
      toast.error(
        action === "reset" ? "Unable to send password reset." : "Unable to resend invite."
      );
    } finally {
      setBusyId(null);
    }
  }

  if (!user) return null;

  return (
    <AppShell user={user} nav={adminNav} title="Organisations">
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="panel org-directory">
        <div className="org-directory-head">
          <div>
            <h2>Client directory</h2>
            <p className="lead">
              {loading ? "Loading…" : `${filtered.length} clients`}
              {!loading && orgs.length !== filtered.length
                ? ` · ${orgs.length} total`
                : ""}
            </p>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>
            Add a client
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
              placeholder="Search name, email, company…"
              aria-label="Filter organisations"
            />
          </div>
          <select
            className="org-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            className="org-filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by organisation type"
          >
            <option value="">All types</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            className="org-filter"
            value={contextFilter}
            onChange={(e) => setContextFilter(e.target.value)}
            aria-label="Filter by regulatory context"
          >
            <option value="">All contexts</option>
            {contextOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 && !loading ? (
          <div className="empty-state">
            <p>No organisations match these filters.</p>
            <p className="lead">Add your first client to start the directory.</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>
              Add a client
            </button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table org-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Contact</th>
                  <th>Type</th>
                  <th>Regulatory</th>
                  <th>Onboarding</th>
                  <th>Cases</th>
                  <th>Status</th>
                  <th className="org-table-actions-col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((org) => {
                  const client = org.users[0];
                  const onboarding = orgOnboardingSummary(org);
                  const contactName = org.contactName || client?.name || "—";
                  const contactEmail = org.email || client?.email || "";
                  return (
                    <tr key={org.id} className={org.status === "inactive" ? "is-inactive" : ""}>
                      <td>
                        <div className="org-table-company">
                          <span className="org-table-avatar" aria-hidden>
                            {orgInitials(org.name)}
                          </span>
                          <div>
                            <span className="primary-cell">{org.name}</span>
                            <span className="secondary-cell">{org.ref || "—"}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="primary-cell">{contactName}</span>
                        <span className="secondary-cell">{contactEmail || "—"}</span>
                      </td>
                      <td>
                        <span className="org-table-muted">{org.type || "—"}</span>
                      </td>
                      <td>
                        <span className="org-table-muted">{org.regulatoryContext || "—"}</span>
                      </td>
                      <td>
                        <div className={`org-onboard org-onboard-${onboarding.tone}`}>
                          <div className="org-onboard-top">
                            <span className="org-onboard-label">{onboarding.label}</span>
                            {onboarding.total > 0 ? (
                              <span className="org-onboard-pct">{onboarding.percent}%</span>
                            ) : null}
                          </div>
                          {onboarding.total > 0 ? (
                            <div
                              className="org-onboard-track"
                              role="progressbar"
                              aria-valuenow={onboarding.percent}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={`Onboarding ${onboarding.percent} percent`}
                            >
                              <span
                                className="org-onboard-fill"
                                style={{ width: `${onboarding.percent}%` }}
                              />
                            </div>
                          ) : (
                            <div className="org-onboard-track is-empty" aria-hidden>
                              <span className="org-onboard-fill" style={{ width: "0%" }} />
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="org-table-cases">{org.openCaseCount ?? 0}</span>
                      </td>
                      <td>
                        <span className={`status-pill status-pill-${org.status}`}>
                          {orgStatusLabel(org.status)}
                        </span>
                      </td>
                      <td className="org-table-actions-col">
                        <RowActionsMenu
                          label={`Actions for ${org.name}`}
                          items={[
                            {
                              id: "open",
                              label: "Open",
                              onSelect: () => router.push(`/admin/organisations/${org.id}`),
                            },
                            {
                              id: "edit",
                              label: "Edit",
                              onSelect: () =>
                                router.push(`/admin/organisations/${org.id}?edit=1`),
                            },
                            {
                              id: "access",
                              label:
                                busyId === org.id
                                  ? "Working…"
                                  : clientAccessActionLabel(clientAccessAction(client)),
                              disabled: busyId === org.id || !client || client.status !== "active",
                              onSelect: () => sendClientAccessLink(org),
                            },
                            {
                              id: "toggle",
                              label:
                                org.status === "active" ? "Deactivate" : "Activate",
                              tone: org.status === "active" ? "danger" : "default",
                              separatorBefore: true,
                              disabled: busyId === org.id,
                              onSelect: () =>
                                setOrgStatus(
                                  org,
                                  org.status === "active" ? "inactive" : "active"
                                ),
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

      <AddOrganisationDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(result) => {
          const mailStatus = result.mailStatus || "skipped";
          storeAccessCredentials({
            organisationId: result.organisation.id,
            organisationName: result.organisation.name,
            clientEmail: result.clientUser.email,
            clientName: result.clientUser.name,
            authMode: result.authMode,
            inviteUrl: result.inviteUrl,
            temporaryPassword: result.temporaryPassword,
            mailStatus,
            createdAt: new Date().toISOString(),
          });
          toast.success(`Created ${result.organisation.name}.`);
          if (mailStatus === "sent") toast.success(mailStatusLabel(mailStatus));
          else if (mailStatus === "failed") toast.error(mailStatusLabel(mailStatus));
          else toast.info(mailStatusLabel(mailStatus));
          loadOrgs();
          router.push(`/admin/organisations/${result.organisation.id}`);
        }}
      />
    </AppShell>
  );
}
