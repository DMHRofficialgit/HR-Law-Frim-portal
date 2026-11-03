"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  Briefcase,
  Calendar,
  CircleCheck,
  Layers,
  Mail,
  Plus,
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
import { useConfirm } from "../../../../context/ConfirmContext";
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
import { clientNav } from "../../../../lib/nav";

function PortalEmployeeDetailInner() {
  const params = useParams();
  const id = String(params.id || "");
  const router = useRouter();
  const { error: toastError, success: toastSuccess } = useToast();
  const { confirm } = useConfirm();

  const [user, setUser] = useState<PublicUser | null>(null);
  const [employee, setEmployee] = useState<EmployeeRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const result = await apiFetch<{ employee: EmployeeRow }>(`/client/employees/${id}`, {
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
    if (!token || !stored || stored.role !== "client") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
    load();
  }, [router, load]);

  async function toggleStatus() {
    if (!employee) return;
    const next = employee.status === "active" ? "inactive" : "active";
    const label = next === "inactive" ? "Deactivate" : "Activate";
    const ok = await confirm({
      title: `${label} employee?`,
      description: `${label} ${employee.name}?`,
      confirmLabel: label,
      tone: next === "inactive" ? "danger" : "default",
    });
    if (!ok) return;
    setBusy(true);
    const result = await apiFetch<{ employee: EmployeeRow }>(`/client/employees/${employee.id}`, {
      method: "PATCH",
      token: getToken(),
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    if (!result.success) {
      toastError(result.error.message);
      return;
    }
    toastSuccess(next === "inactive" ? "Employee deactivated" : "Employee activated");
    setEmployee({ ...employee, ...result.data.employee });
  }

  async function onDelete() {
    if (!employee) return;
    const ok = await confirm({
      title: `Delete ${employee.name}?`,
      description: "Permanently delete this employee? Only allowed with no linked cases.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    const result = await apiFetch(`/client/employees/${employee.id}`, {
      method: "DELETE",
      token: getToken(),
    });
    setBusy(false);
    if (!result.success) {
      toastError(result.error.message);
      return;
    }
    toastSuccess("Employee deleted");
    router.push("/portal/employees");
  }

  const cases = employee?.cases || [];
  const linkedCaseCount = employee?._count?.cases ?? cases.length;
  const hasLinkedCases = linkedCaseCount > 0;
  const openCaseCount = useMemo(
    () => cases.filter((c) => c.status !== "closed").length,
    [cases]
  );

  const casesHref = useMemo(() => {
    if (!employee) return "/portal/cases";
    return `/portal/cases?employee=${encodeURIComponent(employee.id)}`;
  }, [employee]);

  const createCaseHref = useMemo(() => {
    if (!employee) return "/portal/cases?create=1";
    return `/portal/cases?create=1&employee=${encodeURIComponent(employee.id)}`;
  }, [employee]);

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
            href={`/portal/cases/${c.id}`}
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
    <AppShell user={user} nav={clientNav} title={employee?.name || "Employee record"}>
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
                href="/portal/employees"
                label="Back"
                aria-label="Back to employees"
                side="bottom"
              >
                <ArrowLeft size={16} strokeWidth={1.75} />
              </IconButton>
              <div className="profile-hub-titles">
                <h1>{employee.name}</h1>
                <div className="profile-hub-meta">
                  {employee.ref || "—"}
                  <span className={`status-pill status-pill-${employee.status}`}>
                    {employeeStatusLabel(employee.status)}
                  </span>
                </div>
              </div>
            </div>
            <div className="profile-hub-actions">
              <Link href={createCaseHref} className="btn btn-secondary btn-sm">
                <Plus size={14} strokeWidth={1.75} aria-hidden />
                Create case
              </Link>
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
                    id: "toggle",
                    label: employee.status === "active" ? "Deactivate" : "Activate",
                    icon:
                      employee.status === "active" ? (
                        <Ban size={14} strokeWidth={1.75} />
                      ) : (
                        <CircleCheck size={14} strokeWidth={1.75} />
                      ),
                    tone: employee.status === "active" ? "danger" : "default",
                    disabled: busy,
                    onSelect: () => toggleStatus(),
                  },
                  {
                    id: "delete",
                    label: hasLinkedCases ? "Delete (has cases)" : "Delete",
                    icon: <Trash2 size={14} strokeWidth={1.75} />,
                    tone: "danger",
                    separatorBefore: true,
                    disabled: busy || hasLinkedCases,
                    onSelect: () => onDelete(),
                  },
                ]}
              />
            </div>
          </div>

          <div className="profile-hub-metrics emp-hub-metrics">
            <Link href={casesHref} className="profile-metric">
              <Briefcase className="profile-metric-icon" size={14} strokeWidth={1.75} aria-hidden />
              <div className="profile-metric-value">{linkedCaseCount}</div>
              <div className="profile-metric-label">Linked cases</div>
            </Link>
            <Link href={casesHref} className="profile-metric">
              <Briefcase className="profile-metric-icon" size={14} strokeWidth={1.75} aria-hidden />
              <div className="profile-metric-value">{openCaseCount}</div>
              <div className="profile-metric-label">Open cases</div>
            </Link>
            <Link href="/portal/employees" className="profile-metric">
              <Users className="profile-metric-icon" size={14} strokeWidth={1.75} aria-hidden />
              <div className="profile-metric-value is-text">Directory</div>
              <div className="profile-metric-label">Employees</div>
            </Link>
          </div>

          <div className="emp-hub-grid">
            <section className="panel profile-hub-hero">
              <div className="profile-row">
                <div className="profile-avatar" aria-hidden>
                  {employeeInitials(employee.name)}
                </div>
                <div className="profile-hero-main">
                  <div className="profile-meta-grid">
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
              hrefAll={casesHref}
              allLabel="View all cases"
              empty="No linked cases. Cases linked to this employee will appear here."
              rows={caseRows}
            />
          </div>

          <section className="panel emp-hub-notes">
            <div className="emp-hub-notes-head">
              <h2 style={{ margin: 0, fontSize: 14 }}>Notes</h2>
              {!employee.notes ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setEditOpen(true)}
                >
                  Add notes
                </button>
              ) : null}
            </div>
            {employee.notes ? (
              <p>{employee.notes}</p>
            ) : (
              <p className="lead" style={{ margin: 0 }}>
                No notes yet. Add context for DM.HR when useful.
              </p>
            )}
          </section>

          <EmployeeFormDialog
            open={editOpen}
            mode="edit"
            role="client"
            employee={employee}
            onClose={() => setEditOpen(false)}
            onSaved={(updated) => {
              setEmployee((prev) => (prev ? { ...prev, ...updated } : updated));
              void load();
            }}
          />
        </>
      ) : null}
    </AppShell>
  );
}

export default function PortalEmployeeDetailPage() {
  return (
    <Suspense
      fallback={
        <main className="auth-shell">
          <div className="panel">
            <PanelSkeleton lines={6} />
          </div>
        </main>
      }
    >
      <PortalEmployeeDetailInner />
    </Suspense>
  );
}
