"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Ban, CircleCheck, Eye, Pencil } from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { EmployeeFormDialog } from "../../../components/EmployeeFormDialog";
import { PortalSearch } from "../../../components/PortalSearch";
import { PortalSelect } from "../../../components/PortalSelect";
import { RowActionsMenu } from "../../../components/RowActionsMenu";
import { TableSkeleton } from "../../../components/Skeleton";
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
  const toast = useToast();
  const orgFromUrl = search.get("org") || "";

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

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (orgFilter) params.set("organisationId", orgFilter);
    if (statusFilter) params.set("status", statusFilter);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const result = await apiFetch<{ employees: EmployeeRow[] }>(`/admin/employees${qs}`, {
      token: getToken(),
    });
    if (result.success) {
      setEmployees(result.data.employees);
      setError("");
    } else {
      setError(result.error.message);
      toast.error(result.error.message);
    }
    setLoading(false);
  }, [orgFilter, statusFilter, toast]);

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

  async function setEmployeeStatus(emp: EmployeeRow, status: "active" | "inactive") {
    const label = status === "inactive" ? "Deactivate" : "Activate";
    if (!window.confirm(`${label} ${emp.name}?`)) return;
    setBusyId(emp.id);
    const result = await apiFetch<{ employee: EmployeeRow }>(`/admin/employees/${emp.id}`, {
      method: "PATCH",
      token: getToken(),
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error.message);
      return;
    }
    toast.success(status === "inactive" ? "Employee deactivated" : "Employee activated");
    await load();
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
          <TableSkeleton rows={7} cols={8} />
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
          <div className="table-wrap">
            <table className="data-table org-table">
              <thead>
                <tr>
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
                            tone: emp.status === "active" ? "danger" : "default",
                            separatorBefore: true,
                            disabled: busyId === emp.id,
                            onSelect: () =>
                              setEmployeeStatus(
                                emp,
                                emp.status === "active" ? "inactive" : "active"
                              ),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
