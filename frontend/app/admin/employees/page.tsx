"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, ArchiveRestore, Ban, CircleCheck, Eye, Pencil } from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { EmployeeFormDialog } from "../../../components/EmployeeFormDialog";
import { PortalSearch } from "../../../components/PortalSearch";
import { PortalSelect } from "../../../components/PortalSelect";
import { RowActionsMenu } from "../../../components/RowActionsMenu";
import { ShowArchivedToggle } from "../../../components/ShowArchivedToggle";
import { TableSkeleton } from "../../../components/Skeleton";
import { useConfirm } from "../../../context/ConfirmContext";
import { useToast } from "../../../context/ToastContext";
import { apiFetch, type PublicUser } from "../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import {
  employeeInitials,
  employeeStatusLabel,
  formatEmployeeStartDate,
  type EmployeeRow,
} from "../../../lib/employees";
import { adminNav } from "../../../lib/nav";

type OrgOption = { id: string; name: string };

function AdminEmployeesInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { error: toastError, success: toastSuccess } = useToast();
  const { confirm } = useConfirm();
  const orgFromUrl = search.get("org") || "";
  const archivedFromUrl = search.get("archived") === "1";

  const [user, setUser] = useState<PublicUser | null>(null);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [orgFilter, setOrgFilter] = useState(orgFromUrl);
  const [statusFilter, setStatusFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEmployee, setEditEmployee] = useState<EmployeeRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(archivedFromUrl);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (orgFilter) params.set("organisationId", orgFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (showArchived) params.set("archived", "1");
    const qs = params.toString() ? `?${params.toString()}` : "";
    const result = await apiFetch<{ employees: EmployeeRow[] }>(`/admin/employees${qs}`, {
      token: getToken(),
    });
    if (result.success) {
      setEmployees(result.data.employees);
      setError("");
      setSelectedIds(new Set());
    } else {
      setError(result.error.message);
      toastError(result.error.message);
    }
    setLoading(false);
  }, [orgFilter, statusFilter, showArchived, toastError]);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "admin") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
    (async () => {
      const orgsRes = await apiFetch<{ organisations: OrgOption[] }>("/admin/organisations", {
        token,
      });
      if (orgsRes.success) {
        setOrgs(orgsRes.data.organisations.map((o) => ({ id: o.id, name: o.name })));
      }
    })();
  }, [router]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  useEffect(() => {
    if (orgFromUrl) setOrgFilter(orgFromUrl);
  }, [orgFromUrl]);

  useEffect(() => {
    setShowArchived(archivedFromUrl);
  }, [archivedFromUrl]);

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return employees;
    return employees.filter((emp) => {
      const hay = [
        emp.name,
        emp.ref,
        emp.jobTitle,
        emp.department,
        emp.workEmail,
        emp.organisation?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [employees, filter]);

  const selectedCount = filtered.filter((e) => selectedIds.has(e.id)).length;
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((e) => selectedIds.has(e.id));
  const selectedActive = filtered.filter(
    (e) => selectedIds.has(e.id) && e.status === "active"
  );
  const selectedInactive = filtered.filter(
    (e) => selectedIds.has(e.id) && e.status === "inactive"
  );
  const toggleSelectAllFiltered = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (filtered.every((e) => next.has(e.id))) {
        for (const e of filtered) next.delete(e.id);
      } else {
        for (const e of filtered) next.add(e.id);
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

  async function setEmployeeStatus(emp: EmployeeRow, status: "active" | "inactive") {
    const label = status === "inactive" ? "Deactivate" : "Activate";
    const ok = await confirm({
      title: `${label} employee?`,
      description: `${label} ${emp.name}?`,
      confirmLabel: label,
      tone: status === "inactive" ? "danger" : "default",
    });
    if (!ok) return;
    setBusyId(emp.id);
    const result = await apiFetch<{ employee: EmployeeRow }>(`/admin/employees/${emp.id}`, {
      method: "PATCH",
      token: getToken(),
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    if (!result.success) {
      toastError(result.error.message);
      return;
    }
    toastSuccess(status === "inactive" ? "Employee deactivated" : "Employee activated");
    await load();
  }

  async function archiveOne(emp: EmployeeRow) {
    const ok = await confirm({
      title: `Archive ${emp.name}?`,
      description:
        "Hidden from active lists. Restore within 30 days or it is permanently removed (if no linked cases).",
      confirmLabel: "Archive",
      tone: "danger",
    });
    if (!ok) return;
    setBusyId(emp.id);
    const result = await apiFetch<{ employee: EmployeeRow }>(
      `/admin/employees/${emp.id}/archive`,
      { method: "POST", token: getToken() }
    );
    setBusyId(null);
    if (!result.success) {
      toastError(result.error.message);
      return;
    }
    toastSuccess("Employee archived");
    await load();
  }

  async function restoreOne(emp: EmployeeRow) {
    setBusyId(emp.id);
    const result = await apiFetch<{ employee: EmployeeRow }>(
      `/admin/employees/${emp.id}/restore`,
      { method: "POST", token: getToken() }
    );
    setBusyId(null);
    if (!result.success) {
      toastError(result.error.message);
      return;
    }
    toastSuccess("Employee restored");
    await load();
  }

  async function runBulk(
    action: "activate" | "deactivate" | "archive" | "restore"
  ) {
    const ids =
      action === "activate"
        ? selectedInactive.map((e) => e.id)
        : action === "deactivate"
          ? selectedActive.map((e) => e.id)
          : filtered.filter((e) => selectedIds.has(e.id)).map((e) => e.id);
    if (ids.length === 0) return;
    const label =
      action === "activate"
        ? "Activate"
        : action === "deactivate"
          ? "Deactivate"
          : action === "archive"
            ? "Archive"
            : "Restore";
    const ok = await confirm({
      title: `${label} ${ids.length} employee${ids.length === 1 ? "" : "s"}?`,
      description:
        action === "archive"
          ? "Hidden from active lists. Restore within 30 days or they are permanently removed (if no linked cases)."
          : action === "restore"
            ? "Selected employees will return to the active directory."
            : action === "deactivate"
              ? "Selected employees will be marked inactive."
              : "Selected employees will be marked active.",
      confirmLabel: label,
      tone: action === "activate" || action === "restore" ? "default" : "danger",
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      const result = await apiFetch<{
        updated: number;
        skipped: number;
        failed: Array<{ id: string; message: string }>;
      }>("/admin/employees/bulk", {
        method: "POST",
        token: getToken(),
        body: JSON.stringify({ action, ids }),
      });
      if (!result.success) {
        toastError(result.error.message);
        return;
      }
      const verb =
        action === "archive"
          ? "Archived"
          : action === "restore"
            ? "Restored"
            : `${label}d`;
      toastSuccess(
        `${verb} ${result.data.updated}; skipped ${result.data.skipped}; failed ${result.data.failed.length}`
      );
      if (result.data.failed[0]?.message) toastError(result.data.failed[0].message);
      setSelectedIds(new Set());
      await load();
    } catch {
      toastError("Unable to update employees.");
    } finally {
      setBulkBusy(false);
    }
  }

  if (!user) return null;

  return (
    <AppShell user={user} nav={adminNav} title="Employees">
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="panel org-directory">
        <div className="org-directory-head">
          <div>
            <h2>Employee directory</h2>
            <p className="lead">
              {loading ? "…" : `${filtered.length} records`}
              {!loading && employees.length !== filtered.length
                ? ` · ${employees.length} total`
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
                onClick={() => {
                  setEditEmployee(null);
                  setDialogOpen(true);
                }}
              >
                Add employee
              </button>
            ) : null}
          </div>
        </div>

        {showArchived ? (
          <p className="lead archive-hint">
            Archived employees are hidden from active work. Use <strong>Restore</strong> within
            30 days. Purge skips anyone still linked to cases.
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
              placeholder="Search employee, role or client…"
              aria-label="Filter employees"
            />
          </div>
          <PortalSelect
            className="org-filter"
            size="sm"
            aria-label="Filter by client"
            value={orgFilter}
            searchable
            options={[
              { value: "", label: "All clients" },
              ...orgs.map((o) => ({ value: o.id, label: o.name })),
            ]}
            onChange={setOrgFilter}
          />
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
        </div>

        {loading ? (
          <TableSkeleton rows={7} cols={9} />
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p>No employees match these filters.</p>
            <p className="lead">Add a record to link people to cases and client work.</p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                setEditEmployee(null);
                setDialogOpen(true);
              }}
            >
              Add employee
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
                  aria-label="Select all visible employees"
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
                      disabled={selectedActive.length === 0 || bulkBusy}
                      onClick={() => void runBulk("deactivate")}
                    >
                      <Ban size={14} strokeWidth={1.75} aria-hidden />
                      Deactivate
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={selectedInactive.length === 0 || bulkBusy}
                      onClick={() => void runBulk("activate")}
                    >
                      <CircleCheck size={14} strokeWidth={1.75} aria-hidden />
                      Activate
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm docs-btn-danger"
                      disabled={selectedCount === 0 || bulkBusy}
                      onClick={() => void runBulk("archive")}
                    >
                      <Archive size={14} strokeWidth={1.75} aria-hidden />
                      Archive
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={selectedCount === 0 || bulkBusy}
                    onClick={() => void runBulk("restore")}
                  >
                    <ArchiveRestore size={14} strokeWidth={1.75} aria-hidden />
                    Restore
                  </button>
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
                    <th>Employee</th>
                    <th>Client</th>
                    <th>Job title</th>
                    <th>Department / service</th>
                    <th>Start date</th>
                    <th>Cases</th>
                    <th>Status</th>
                    <th className="org-table-actions-col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((emp) => (
                    <tr
                      key={emp.id}
                      className={emp.status === "inactive" ? "is-inactive" : ""}
                    >
                      <td className="org-table-check-col">
                        <label className="docs-row-check">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(emp.id)}
                            onChange={() => toggleSelectOne(emp.id)}
                            aria-label={`Select ${emp.name}`}
                          />
                        </label>
                      </td>
                      <td>
                        <div className="org-table-company">
                          <span className="org-table-avatar" aria-hidden>
                            {employeeInitials(emp.name)}
                          </span>
                          <div>
                            <span className="primary-cell">{emp.name}</span>
                            <span className="secondary-cell">
                              {[emp.ref, emp.workEmail].filter(Boolean).join(" · ") || "—"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        {emp.organisation ? (
                          <Link
                            href={`/admin/organisations/${emp.organisation.id}`}
                            className="primary-cell"
                          >
                            {emp.organisation.name}
                          </Link>
                        ) : (
                          <span className="org-table-muted">—</span>
                        )}
                      </td>
                      <td>
                        <span className="org-table-muted">{emp.jobTitle || "—"}</span>
                      </td>
                      <td>
                        <span className="org-table-muted">{emp.department || "—"}</span>
                      </td>
                      <td>
                        <span className="org-table-muted">
                          {formatEmployeeStartDate(emp.startDate)}
                        </span>
                      </td>
                      <td>
                        <span className="org-table-cases">{emp._count?.cases ?? 0}</span>
                      </td>
                      <td>
                        <span className={`status-pill status-pill-${emp.status}`}>
                          {employeeStatusLabel(emp.status)}
                        </span>
                      </td>
                      <td className="org-table-actions-col">
                        <RowActionsMenu
                          label={`Actions for ${emp.name}`}
                          items={[
                            {
                              id: "view",
                              label: "View",
                              icon: <Eye size={14} strokeWidth={1.75} />,
                              onSelect: () => router.push(`/admin/employees/${emp.id}`),
                            },
                            {
                              id: "edit",
                              label: "Edit",
                              icon: <Pencil size={14} strokeWidth={1.75} />,
                              onSelect: () => {
                                setEditEmployee(emp);
                                setDialogOpen(true);
                              },
                            },
                            ...(showArchived
                              ? [
                                  {
                                    id: "restore",
                                    label: "Restore",
                                    icon: <ArchiveRestore size={14} strokeWidth={1.75} />,
                                    separatorBefore: true,
                                    disabled: busyId === emp.id,
                                    onSelect: () => void restoreOne(emp),
                                  },
                                ]
                              : [
                                  {
                                    id: "toggle",
                                    label:
                                      emp.status === "active" ? "Deactivate" : "Activate",
                                    icon:
                                      emp.status === "active" ? (
                                        <Ban size={14} strokeWidth={1.75} />
                                      ) : (
                                        <CircleCheck size={14} strokeWidth={1.75} />
                                      ),
                                    tone:
                                      emp.status === "active"
                                        ? ("danger" as const)
                                        : ("default" as const),
                                    separatorBefore: true,
                                    disabled: busyId === emp.id,
                                    onSelect: () =>
                                      setEmployeeStatus(
                                        emp,
                                        emp.status === "active" ? "inactive" : "active"
                                      ),
                                  },
                                  {
                                    id: "archive",
                                    label: "Archive",
                                    icon: <Archive size={14} strokeWidth={1.75} />,
                                    tone: "danger" as const,
                                    disabled: busyId === emp.id,
                                    onSelect: () => void archiveOne(emp),
                                  },
                                ]),
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <p className="lead" style={{ marginTop: 12, marginBottom: 0, fontSize: "0.85rem" }}>
          This is a lightweight employee information register, not a full HRIS.
        </p>
      </section>

      <EmployeeFormDialog
        open={dialogOpen}
        mode={editEmployee ? "edit" : "create"}
        role="admin"
        orgs={orgs}
        initialOrganisationId={orgFilter || orgs[0]?.id || ""}
        employee={editEmployee}
        onClose={() => {
          setDialogOpen(false);
          setEditEmployee(null);
        }}
        onSaved={() => load()}
      />
    </AppShell>
  );
}

export default function AdminEmployeesPage() {
  return (
    <Suspense fallback={<main className="auth-shell">Loading…</main>}>
      <AdminEmployeesInner />
    </Suspense>
  );
}
