"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  Briefcase,
  Building2,
  Calendar,
  CircleCheck,
  Layers,
  Mail,
  Pencil,
  Trash2,
  Users,
} from "lucide-react";
import { AppShell } from "../../../../components/AppShell";
import { EmployeeFormDialog } from "../../../../components/EmployeeFormDialog";
import { IconButton } from "../../../../components/IconButton";
import {
  ProfileActivityPanel,
  type ProfileActivityRow,
} from "../../../../components/ProfileActivityPanel";
import { PanelSkeleton } from "../../../../components/Skeleton";
import { RowActionsMenu } from "../../../../components/RowActionsMenu";
import { useToast } from "../../../../context/ToastContext";
import { apiFetch, type PublicUser } from "../../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../../lib/auth";
import { caseBadgeTone, statusLabel } from "../../../../lib/cases";
import {
  employeeInitials,
  employeeStatusLabel,
  formatEmployeeStartDate,
  type EmployeeRow,
} from "../../../../lib/employees";
import { adminNav } from "../../../../lib/nav";

function AdminEmployeeDetailInner() {
  const params = useParams();
  const id = String(params.id || "");
  const router = useRouter();
  const toast = useToast();

  const [user, setUser] = useState<PublicUser | null>(null);
  const [employee, setEmployee] = useState<EmployeeRow | null>(null);
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const result = await apiFetch<{ employee: EmployeeRow }>(`/admin/employees/${id}`, {
      token: getToken(),
    });
    if (result.success) {
      setEmployee(result.data.employee);
      setError("");
    } else {
      setError(result.error.message);
      setEmployee(null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "admin") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
    load();
    (async () => {
      const orgsRes = await apiFetch<{ organisations: Array<{ id: string; name: string }> }>(
        "/admin/organisations",
        { token }
      );
      if (orgsRes.success) {
        setOrgs(orgsRes.data.organisations.map((o) => ({ id: o.id, name: o.name })));
      }
    })();
  }, [router, load]);

  async function toggleStatus() {
    if (!employee) return;
    const next = employee.status === "active" ? "inactive" : "active";
    const label = next === "inactive" ? "Deactivate" : "Activate";
    if (!window.confirm(`${label} ${employee.name}?`)) return;
    setBusy(true);
    const result = await apiFetch<{ employee: EmployeeRow }>(`/admin/employees/${employee.id}`, {
      method: "PATCH",
      token: getToken(),
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    if (!result.success) {
      toast.error(result.error.message);
      return;
    }
    toast.success(next === "inactive" ? "Employee deactivated" : "Employee activated");
    setEmployee({ ...employee, ...result.data.employee });
  }

  async function onDelete() {
    if (!employee) return;
    if (!window.confirm(`Permanently delete ${employee.name}? Only allowed with no linked cases.`)) {
      return;
    }
    setBusy(true);
    const result = await apiFetch(`/admin/employees/${employee.id}`, {
      method: "DELETE",
      token: getToken(),
    });
    setBusy(false);
    if (!result.success) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Employee deleted");
    router.push("/admin/employees");
  }

  const cases = employee?.cases || [];
  const openCaseCount = useMemo(
    () => cases.filter((c) => c.status !== "closed").length,
    [cases]
  );

  const caseRows: ProfileActivityRow[] = useMemo(
    () =>
      cases.map((c) => ({
        id: c.id,
        title: c.ref,
        meta: c.title,
        badge: statusLabel(c.status),
        badgeTone: caseBadgeTone(c.status),
        actions: (
          <IconButton
            href={`/admin/cases/${c.id}`}
            label="Open case"
            aria-label={`Open case ${c.ref}`}
          >
            <Briefcase size={15} strokeWidth={1.75} />
          </IconButton>
        ),
      })),
    [cases]
  );

  const formatStamp = (value?: string) => {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleDateString();
    } catch {
      return "—";
    }
  };

  if (!user) return null;

  return (
    <AppShell user={user} nav={adminNav} title={employee?.name || "Employee record"}>
      {error ? <div className="error-banner">{error}</div> : null}

      {loading ? (
        <div className="panel">
          <PanelSkeleton lines={6} />
        </div>
      ) : null}

      {employee && !loading ? (
        <>
          <div className="profile-hub-head">
            <div className="profile-hub-head-main">
              <IconButton
                href="/admin/employees"
                label="Back"
                aria-label="Back to employees"
                side="bottom"
              >
                <ArrowLeft size={16} strokeWidth={1.75} />
              </IconButton>
              <div className="profile-hub-titles">
                <h1>{employee.name}</h1>
                <div className="profile-hub-meta">
                  {[employee.ref, employee.organisation?.name].filter(Boolean).join(" · ") || "—"}
                  <span className={`status-pill status-pill-${employee.status}`}>
                    {employeeStatusLabel(employee.status)}
                  </span>
                </div>
              </div>
            </div>
            <div className="profile-hub-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setEditOpen(true)}
              >
                Edit record
              </button>
              <RowActionsMenu
                label={`Actions for ${employee.name}`}
                items={[
                  {
                    id: "edit",
                    label: "Edit",
                    icon: <Pencil size={14} strokeWidth={1.75} />,
                    onSelect: () => setEditOpen(true),
                  },
                  {
                    id: "client",
                    label: "Open client",
                    icon: <Building2 size={14} strokeWidth={1.75} />,
                    disabled: !employee.organisationId,
                    onSelect: () =>
                      router.push(`/admin/organisations/${employee.organisationId}`),
                  },
                  {
                    id: "directory",
                    label: "Employees for client",
                    icon: <Users size={14} strokeWidth={1.75} />,
                    disabled: !employee.organisationId,
                    onSelect: () =>
                      router.push(
                        `/admin/employees?org=${encodeURIComponent(employee.organisationId)}`
                      ),
                  },
                  {
                    id: "toggle",
                    label: employee.status === "active" ? "Deactivate" : "Activate",
                    icon:
                      employee.status === "active" ? (
                        <Ban size={14} strokeWidth={1.75} />
                      ) : (
                        <CircleCheck size={14} strokeWidth={1.75} />
                      ),
                    tone: employee.status === "active" ? "danger" : "default",
                    separatorBefore: true,
                    disabled: busy,
                    onSelect: () => toggleStatus(),
                  },
                  {
                    id: "delete",
                    label: "Delete",
                    icon: <Trash2 size={14} strokeWidth={1.75} />,
                    tone: "danger",
                    separatorBefore: true,
                    disabled: busy,
                    onSelect: () => onDelete(),
                  },
                ]}
              />
            </div>
          </div>

          <div className="profile-hub-metrics emp-hub-metrics">
            <Link
              href={
                employee.organisationId
                  ? `/admin/cases?org=${encodeURIComponent(employee.organisationId)}`
                  : "/admin/cases"
              }
              className="profile-metric"
            >
              <Briefcase className="profile-metric-icon" size={14} strokeWidth={1.75} aria-hidden />
              <div className="profile-metric-value">{cases.length}</div>
              <div className="profile-metric-label">Linked cases</div>
            </Link>
            <Link
              href={
                employee.organisationId
                  ? `/admin/cases?org=${encodeURIComponent(employee.organisationId)}`
                  : "/admin/cases"
              }
              className="profile-metric"
            >
              <Briefcase className="profile-metric-icon" size={14} strokeWidth={1.75} aria-hidden />
              <div className="profile-metric-value">{openCaseCount}</div>
              <div className="profile-metric-label">Open cases</div>
            </Link>
            {employee.organisation ? (
              <Link
                href={`/admin/organisations/${employee.organisation.id}`}
                className="profile-metric"
              >
                <Building2
                  className="profile-metric-icon"
                  size={14}
                  strokeWidth={1.75}
                  aria-hidden
                />
                <div className="profile-metric-value is-text">{employee.organisation.name}</div>
                <div className="profile-metric-label">Client</div>
              </Link>
            ) : (
              <div className="profile-metric">
                <Building2
                  className="profile-metric-icon"
                  size={14}
                  strokeWidth={1.75}
                  aria-hidden
                />
                <div className="profile-metric-value is-text">—</div>
                <div className="profile-metric-label">Client</div>
              </div>
            )}
          </div>

          <div className="emp-hub-grid">
            <section className="panel profile-hub-hero">
              <div className="profile-row">
                <div className="profile-avatar" aria-hidden>
                  {employeeInitials(employee.name)}
                </div>
                <div className="profile-hero-main">
                  <div className="profile-meta-grid">
                    <div className="profile-meta-item" title="Client company">
                      <Building2 size={14} strokeWidth={1.75} aria-hidden />
                      <span>
                        {employee.organisation ? (
                          <Link href={`/admin/organisations/${employee.organisation.id}`}>
                            {employee.organisation.name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </span>
                    </div>
                    <div className="profile-meta-item" title="Job title">
                      <Briefcase size={14} strokeWidth={1.75} aria-hidden />
                      <span>{employee.jobTitle || "—"}</span>
                    </div>
                    <div className="profile-meta-item" title="Department / service">
                      <Layers size={14} strokeWidth={1.75} aria-hidden />
                      <span>{employee.department || "—"}</span>
                    </div>
                    <div className="profile-meta-item" title="Start date">
                      <Calendar size={14} strokeWidth={1.75} aria-hidden />
                      <span>{formatEmployeeStartDate(employee.startDate)}</span>
                    </div>
                    <div className="profile-meta-item" title="Work email">
                      <Mail size={14} strokeWidth={1.75} aria-hidden />
                      <span>{employee.workEmail || "—"}</span>
                    </div>
                  </div>
                  <p className="emp-hub-record-meta">
                    Updated {formatStamp(employee.updatedAt)}
                    {employee.createdAt ? ` · Created ${formatStamp(employee.createdAt)}` : ""}
                  </p>
                </div>
              </div>
            </section>

            <ProfileActivityPanel
              title={
                caseRows.length
                  ? `Related employment cases · ${caseRows.length}`
                  : "Related employment cases"
              }
              hrefAll={
                employee.organisationId
                  ? `/admin/cases?org=${encodeURIComponent(employee.organisationId)}`
                  : "/admin/cases"
              }
              allLabel="View all cases"
              empty="No linked cases. Cases linked to this employee will appear here."
              rows={caseRows}
            />
          </div>

          {employee.notes ? (
            <section className="panel emp-hub-notes">
              <h2 style={{ margin: 0, fontSize: 14 }}>Notes</h2>
              <p>{employee.notes}</p>
            </section>
          ) : null}

          <EmployeeFormDialog
            open={editOpen}
            mode="edit"
            role="admin"
            orgs={orgs}
            employee={employee}
            onClose={() => setEditOpen(false)}
            onSaved={(updated) => {
              setEmployee({ ...employee, ...updated });
              load();
            }}
          />
        </>
      ) : null}
    </AppShell>
  );
}

export default function AdminEmployeeDetailPage() {
  return (
    <Suspense fallback={<main className="auth-shell">Loading…</main>}>
      <AdminEmployeeDetailInner />
    </Suspense>
  );
}
