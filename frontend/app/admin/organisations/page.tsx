"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Ban,
  CircleCheck,
  Eye,
  KeyRound,
  Pencil,
  Trash2,
} from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { AddOrganisationDialog } from "../../../components/AddOrganisationDialog";
import { OrgDeleteDialog } from "../../../components/OrgDeleteDialog";
import { PortalSearch } from "../../../components/PortalSearch";
import { PortalSelect } from "../../../components/PortalSelect";
import { RowActionsMenu } from "../../../components/RowActionsMenu";
import { ShowArchivedToggle } from "../../../components/ShowArchivedToggle";
import { TableSkeleton } from "../../../components/Skeleton";
import { useConfirm } from "../../../context/ConfirmContext";
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

const BULK_DELETE_PHRASE = "DELETE";

export default function AdminOrganisationsPage() {
  const router = useRouter();
  const { error: toastError, success: toastSuccess, info: toastInfo } = useToast();
  const { confirm } = useConfirm();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [orgs, setOrgs] = useState<OrgListRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [contextFilter, setContextFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OrgListRow | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const closeAddDialog = useCallback(() => setAddOpen(false), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("archived") === "1") setShowArchived(true);
  }, []);

  const loadOrgs = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const qs = showArchived ? "?archived=1" : "";
      const result = await apiFetch<{ organisations: OrgListRow[] }>(
        `/admin/organisations${qs}`,
        { token }
      );
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
      setSelectedIds(new Set());
    } catch {
      setError("Unable to load organisations.");
    } finally {
      setLoading(false);
    }
  }, [router, showArchived]);

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

  const selectedCount = filtered.filter((o) => selectedIds.has(o.id)).length;
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((o) => selectedIds.has(o.id));
  const selectedOrgs = filtered.filter((o) => selectedIds.has(o.id));
  const selectedInactiveCount = selectedOrgs.filter((o) => o.status === "inactive").length;
  const selectedActiveCount = selectedOrgs.filter((o) => o.status === "active").length;

  const toggleSelectAllFiltered = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (filtered.every((o) => next.has(o.id))) {
        for (const o of filtered) next.delete(o.id);
      } else {
        for (const o of filtered) next.add(o.id);
      }
      return next;
    });
  }, [filtered]);

  const toggleSelectOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
    const label = status === "inactive" ? "Deactivate" : "Activate";
    const ok = await confirm({
      title: `${label} client?`,
      description:
        status === "inactive"
          ? `Deactivate ${org.name}? Client users keep accounts but the organisation is marked inactive.`
          : `Activate ${org.name}?`,
      confirmLabel: label,
      tone: status === "inactive" ? "danger" : "default",
    });
    if (!ok) return;
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
        toastError(result.error.message);
        return;
      }
      toastSuccess(
        status === "inactive"
          ? `${org.name} deactivated.`
          : `${org.name} activated.`
      );
      await loadOrgs();
    } catch {
      toastError("Unable to update organisation status.");
    } finally {
      setBusyId(null);
    }
  }

  async function archiveOne(org: OrgListRow) {
    const ok = await confirm({
      title: `Archive ${org.name}?`,
      description:
        "Hidden from active lists. You can restore within 30 days; after that it is permanently removed.",
      confirmLabel: "Archive",
      tone: "danger",
    });
    if (!ok) return;
    setBusyId(org.id);
    try {
      const result = await apiFetch<{ organisation: OrgListRow }>(
        `/admin/organisations/${org.id}/archive`,
        { method: "POST", token: getToken() }
      );
      if (!result.success) {
        toastError(result.error.message);
        return;
      }
      toastSuccess(`${org.name} archived.`);
      await loadOrgs();
    } catch {
      toastError("Unable to archive organisation.");
    } finally {
      setBusyId(null);
    }
  }

  async function restoreOne(org: OrgListRow) {
    setBusyId(org.id);
    try {
      const result = await apiFetch<{ organisation: OrgListRow }>(
        `/admin/organisations/${org.id}/restore`,
        { method: "POST", token: getToken() }
      );
      if (!result.success) {
        toastError(result.error.message);
        return;
      }
      toastSuccess(`${org.name} restored.`);
      await loadOrgs();
    } catch {
      toastError("Unable to restore organisation.");
    } finally {
      setBusyId(null);
    }
  }

  async function hardDeleteOne(org: OrgListRow, confirmName: string) {
    setDeleteBusy(true);
    try {
      const result = await apiFetch<{ organisation: { id: string; name: string } }>(
        `/admin/organisations/${org.id}`,
        {
          method: "DELETE",
          token: getToken(),
          body: JSON.stringify({ confirmName }),
        }
      );
      if (!result.success) {
        toastError(result.error.message);
        return;
      }
      toastSuccess(`${org.name} permanently deleted.`);
      setDeleteTarget(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(org.id);
        return next;
      });
      await loadOrgs();
    } catch {
      toastError("Unable to delete organisation.");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function runBulkArchiveOrRestore(action: "archive" | "restore") {
    const ids = selectedOrgs.map((o) => o.id);
    if (ids.length === 0) return;
    const label = action === "archive" ? "Archive" : "Restore";
    const ok = await confirm({
      title: `${label} ${ids.length} client${ids.length === 1 ? "" : "s"}?`,
      description:
        action === "archive"
          ? "Hidden from active lists for 30 days, then permanently removed unless restored."
          : "Bring selected clients back into the active directory.",
      confirmLabel: label,
      tone: action === "archive" ? "danger" : "default",
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      const result = await apiFetch<{ updated: number; skipped: number }>(
        "/admin/organisations/bulk",
        {
          method: "POST",
          token: getToken(),
          body: JSON.stringify({ action, ids }),
        }
      );
      if (!result.success) {
        toastError(result.error.message);
        return;
      }
      toastSuccess(`${label}d ${result.data.updated}.`);
      setSelectedIds(new Set());
      await loadOrgs();
    } catch {
      toastError(`Unable to ${action} organisations.`);
    } finally {
      setBulkBusy(false);
    }
  }

  async function runBulkStatus(action: "activate" | "deactivate") {
    const ids = selectedOrgs.map((o) => o.id);
    if (ids.length === 0) return;
    const label = action === "deactivate" ? "Deactivate" : "Activate";
    const ok = await confirm({
      title: `${label} ${ids.length} client${ids.length === 1 ? "" : "s"}?`,
      description:
        action === "deactivate"
          ? "Selected organisations will be marked inactive. Client users keep accounts."
          : "Selected organisations will be marked active.",
      confirmLabel: label,
      tone: action === "deactivate" ? "danger" : "default",
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      const result = await apiFetch<{ updated: number; skipped: number }>(
        "/admin/organisations/bulk",
        {
          method: "POST",
          token: getToken(),
          body: JSON.stringify({ action, ids }),
        }
      );
      if (!result.success) {
        toastError(result.error.message);
        return;
      }
      toastSuccess(
        action === "deactivate"
          ? `Deactivated ${result.data.updated}.`
          : `Activated ${result.data.updated}.`
      );
      setSelectedIds(new Set());
      await loadOrgs();
    } catch {
      toastError("Unable to update organisations.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function runBulkDelete(confirmPhrase: string) {
    const ids = selectedOrgs
      .filter((o) => Boolean(o.archivedAt) || o.status === "inactive")
      .map((o) => o.id);
    if (ids.length === 0) {
      toastError("Only archived organisations can be permanently deleted.");
      return;
    }
    setDeleteBusy(true);
    try {
      const result = await apiFetch<{
        deleted: Array<{ id: string; name: string }>;
        failed: Array<{ id: string; message: string }>;
      }>("/admin/organisations/bulk", {
        method: "POST",
        token: getToken(),
        body: JSON.stringify({
          action: "delete",
          ids,
          confirmPhrase,
        }),
      });
      if (!result.success) {
        toastError(result.error.message);
        return;
      }
      const deletedCount = result.data.deleted.length;
      const failedCount = result.data.failed.length;
      if (deletedCount > 0) {
        toastSuccess(`Permanently deleted ${deletedCount}.`);
      }
      if (failedCount > 0) {
        toastError(
          result.data.failed[0]?.message ||
            `${failedCount} organisation(s) could not be deleted.`
        );
      }
      setBulkDeleteOpen(false);
      setSelectedIds(new Set());
      await loadOrgs();
    } catch {
      toastError("Unable to delete organisations.");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function sendClientAccessLink(org: OrgListRow) {
    const primary = org.users[0];
    if (!primary || primary.status !== "active") {
      toastError("No active client login.");
      return;
    }
    const action = clientAccessAction(primary);
    if (action === "reset") {
      const ok = await confirm({
        title: "Send password reset?",
        description: `Send a password reset link to ${primary.email}? They can choose a new password.`,
        confirmLabel: "Send reset",
      });
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
        toastError(result.error.message);
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
      toastSuccess(
        purpose === "reset"
          ? `Password reset sent for ${primary.email}.`
          : `Invite refreshed for ${primary.email}.`
      );
      if (mailStatus === "sent") toastSuccess(mailStatusLabel(mailStatus));
      else if (mailStatus === "failed") toastError(mailStatusLabel(mailStatus));
      else toastInfo(mailStatusLabel(mailStatus));
      router.push(`/admin/organisations/${org.id}`);
    } catch {
      toastError(
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
              {loading ? "…" : `${filtered.length} clients`}
              {!loading && orgs.length !== filtered.length
                ? ` · ${orgs.length} total`
                : ""}
            </p>
            </div>
          <div className="org-directory-head-actions">
            <ShowArchivedToggle
              checked={showArchived}
              onChange={setShowArchived}
              disabled={loading}
            />
            {!showArchived ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setAddOpen(true)}
              >
                Add a client
              </button>
            ) : null}
            </div>
            </div>

        {showArchived ? (
          <p className="lead archive-hint">
            Archived clients are hidden from active work. Use <strong>Restore</strong> to bring
            them back. They are permanently removed after 30 days.
          </p>
        ) : null}

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
          <PortalSelect
            className="org-filter"
            size="sm"
            aria-label="Filter by status"
            value={statusFilter}
            options={[
              { value: "", label: "All statuses" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
            onChange={setStatusFilter}
          />
          <PortalSelect
            className="org-filter"
            size="sm"
            aria-label="Filter by organisation type"
            value={typeFilter}
            searchable={typeOptions.length > 8}
            options={[
              { value: "", label: "All types" },
              ...typeOptions.map((t) => ({ value: t, label: t })),
            ]}
            onChange={setTypeFilter}
          />
          <PortalSelect
            className="org-filter"
            size="sm"
            aria-label="Filter by regulatory context"
            value={contextFilter}
            searchable={contextOptions.length > 8}
            options={[
              { value: "", label: "All contexts" },
              ...contextOptions.map((c) => ({ value: c, label: c })),
            ]}
            onChange={setContextFilter}
              />
            </div>

        {loading ? (
          <TableSkeleton rows={7} cols={9} />
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p>No organisations match these filters.</p>
            <p className="lead">Add your first client to start the directory.</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>
              Add a client
            </button>
            </div>
        ) : (
          <>
            <div className="docs-select-bar">
              <label className="docs-select-all">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAllFiltered}
                  aria-label="Select all visible organisations"
                />
                <span>
                  {selectedCount}/{filtered.length} selected
                </span>
              </label>
              <div className="docs-select-actions">
                {!showArchived ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={selectedCount === 0 || bulkBusy || selectedActiveCount === 0}
                      onClick={() => void runBulkStatus("deactivate")}
                    >
                      <Ban size={14} strokeWidth={1.75} aria-hidden />
                      Deactivate
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={selectedCount === 0 || bulkBusy || selectedInactiveCount === 0}
                      onClick={() => void runBulkStatus("activate")}
                    >
                      <CircleCheck size={14} strokeWidth={1.75} aria-hidden />
                      Activate
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm docs-btn-danger"
                      disabled={selectedCount === 0 || bulkBusy}
                      onClick={() => void runBulkArchiveOrRestore("archive")}
                    >
                      <Archive size={14} strokeWidth={1.75} aria-hidden />
                      Archive
          </button>
                  </>
                ) : (
                  <>
                  <button
                    type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={selectedCount === 0 || bulkBusy}
                      onClick={() => void runBulkArchiveOrRestore("restore")}
                    >
                      <ArchiveRestore size={14} strokeWidth={1.75} aria-hidden />
                      Restore
                  </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm docs-btn-danger"
                      disabled={selectedCount === 0 || bulkBusy}
                      onClick={() => setBulkDeleteOpen(true)}
                    >
                      <Trash2 size={14} strokeWidth={1.75} aria-hidden />
                      Delete now
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="table-wrap">
              <table className="data-table org-table">
                <thead>
                  <tr>
                    <th className="org-table-check-col">
                      <span className="sr-only">Select</span>
                    </th>
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
                        <td className="org-table-check-col">
                          <label className="docs-row-check">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(org.id)}
                              onChange={() => toggleSelectOne(org.id)}
                              aria-label={`Select ${org.name}`}
                            />
                          </label>
                        </td>
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
                                icon: <Eye size={14} strokeWidth={1.75} />,
                                onSelect: () => router.push(`/admin/organisations/${org.id}`),
                              },
                              {
                                id: "edit",
                                label: "Edit",
                                icon: <Pencil size={14} strokeWidth={1.75} />,
                                onSelect: () =>
                                  router.push(`/admin/organisations/${org.id}?edit=1`),
                              },
                              {
                                id: "access",
                                label:
                                  busyId === org.id
                                    ? "Working…"
                                    : clientAccessActionLabel(clientAccessAction(client)),
                                icon: <KeyRound size={14} strokeWidth={1.75} />,
                                disabled:
                                  busyId === org.id || !client || client.status !== "active",
                                onSelect: () => sendClientAccessLink(org),
                              },
                              ...(showArchived
                                ? [
                                    {
                                      id: "restore",
                                      label: "Restore",
                                      icon: <ArchiveRestore size={14} strokeWidth={1.75} />,
                                      separatorBefore: true,
                                      disabled: busyId === org.id,
                                      onSelect: () => void restoreOne(org),
                                    },
                                    {
                                      id: "delete",
                                      label: "Delete now",
                                      icon: <Trash2 size={14} strokeWidth={1.75} />,
                                      tone: "danger" as const,
                                      disabled: busyId === org.id,
                                      onSelect: () => setDeleteTarget(org),
                                    },
                                  ]
                                : [
                                    {
                                      id: "toggle",
                                      label:
                                        org.status === "active" ? "Deactivate" : "Activate",
                                      icon:
                                        org.status === "active" ? (
                                          <Ban size={14} strokeWidth={1.75} />
                                        ) : (
                                          <CircleCheck size={14} strokeWidth={1.75} />
                                        ),
                                      tone:
                                        org.status === "active"
                                          ? ("danger" as const)
                                          : ("default" as const),
                                      separatorBefore: true,
                                      disabled: busyId === org.id,
                                      onSelect: () =>
                                        setOrgStatus(
                                          org,
                                          org.status === "active" ? "inactive" : "active"
                                        ),
                                    },
                                    {
                                      id: "archive",
                                      label: "Archive",
                                      icon: <Archive size={14} strokeWidth={1.75} />,
                                      tone: "danger" as const,
                                      disabled: busyId === org.id,
                                      onSelect: () => void archiveOne(org),
                                    },
                                  ]),
                            ]}
                          />
                        </td>
                      </tr>
            );
          })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <AddOrganisationDialog
        open={addOpen}
        onClose={closeAddDialog}
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
          toastSuccess(`Created ${result.organisation.name}.`);
          if (mailStatus === "sent") toastSuccess(mailStatusLabel(mailStatus));
          else if (mailStatus === "failed") toastError(mailStatusLabel(mailStatus));
          else toastInfo(mailStatusLabel(mailStatus));
          loadOrgs();
          router.push(`/admin/organisations/${result.organisation.id}`);
        }}
      />

      <OrgDeleteDialog
        open={Boolean(deleteTarget)}
        mode="single"
        titleName={deleteTarget?.name || ""}
        expectedConfirm={deleteTarget?.name || ""}
        busy={deleteBusy}
        onClose={() => {
          if (!deleteBusy) setDeleteTarget(null);
        }}
        onConfirm={(typed) => {
          if (deleteTarget) void hardDeleteOne(deleteTarget, typed);
        }}
      />

      <OrgDeleteDialog
        open={bulkDeleteOpen}
        mode="bulk"
        titleName={`${selectedCount} archived client${selectedCount === 1 ? "" : "s"}`}
        expectedConfirm={BULK_DELETE_PHRASE}
        busy={deleteBusy}
        onClose={() => {
          if (!deleteBusy) setBulkDeleteOpen(false);
        }}
        onConfirm={(typed) => {
          void runBulkDelete(typed);
        }}
      />
    </AppShell>
  );
}
