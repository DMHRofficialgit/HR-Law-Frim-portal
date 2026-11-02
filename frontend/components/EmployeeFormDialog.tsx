"use client";

import { FormEvent, useEffect, useId, useState, type ReactElement } from "react";
import { X } from "lucide-react";
import { useToast } from "../context/ToastContext";
import { apiFetch } from "../lib/api";
import { getToken } from "../lib/auth";
import {
  emptyEmployeeForm,
  employeePayloadFromForm,
  employeeToFormValues,
  type EmployeeFormValues,
  type EmployeeRow,
} from "../lib/employees";
import { IconButton } from "./IconButton";
import { PortalSelect } from "./PortalSelect";
import { StatusLiquidToggle } from "./StatusLiquidToggle";

type OrgOption = { id: string; name: string };

const EMPTY_ORGS: OrgOption[] = [];

type EmployeeFormDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  role: "admin" | "client";
  orgs?: OrgOption[];
  initialOrganisationId?: string;
  employee?: EmployeeRow | null;
  onClose: () => void;
  onSaved: (employee: EmployeeRow) => void;
};

export const EmployeeFormDialog = ({
  open,
  mode,
  role,
  orgs = EMPTY_ORGS,
  initialOrganisationId = "",
  employee = null,
  onClose,
  onSaved,
}: EmployeeFormDialogProps): ReactElement | null => {
  const titleId = useId();
  const toast = useToast();
  const [form, setForm] = useState<EmployeeFormValues>(emptyEmployeeForm());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const employeeId = employee?.id || "";
  const firstOrgId = orgs[0]?.id || "";

  // Reset form when dialog opens (or when switching the edited employee).
  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && employee) {
      setForm(employeeToFormValues(employee));
    } else {
      setForm(emptyEmployeeForm(initialOrganisationId || firstOrgId || ""));
    }
    setError("");
    // employee read on open/employeeId change only — avoid depending on object identity
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable reset keys above
  }, [open, mode, employeeId, initialOrganisationId, firstOrgId]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (role === "admin" && mode === "create" && !form.organisationId) {
      const msg = "Select a client company.";
      setError(msg);
      toast.error(msg);
      return;
    }
    if (!form.name.trim() || !form.jobTitle.trim()) {
      const msg = "Name and job title are required.";
      setError(msg);
      toast.error(msg);
      return;
    }

    setSaving(true);
    try {
      const includeOrg = role === "admin" && mode === "create";
      const body = employeePayloadFromForm(form, includeOrg);

      let result;
      if (mode === "create") {
        const path = role === "admin" ? "/admin/employees" : "/client/employees";
        result = await apiFetch<{ employee: EmployeeRow }>(path, {
          method: "POST",
          token: getToken(),
          body: JSON.stringify(body),
        });
      } else if (employee) {
        const path =
          role === "admin"
            ? `/admin/employees/${employee.id}`
            : `/client/employees/${employee.id}`;
        result = await apiFetch<{ employee: EmployeeRow }>(path, {
          method: "PATCH",
          token: getToken(),
          body: JSON.stringify(body),
        });
      } else {
        setSaving(false);
        return;
      }

      if (!result.success) {
        setError(result.error.message);
        toast.error(result.error.message);
        return;
      }

      toast.success(mode === "create" ? "Employee added" : "Employee updated");
      onSaved(result.data.employee);
      onClose();
    } catch {
      const msg = "Unable to save employee.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const title = mode === "create" ? "Add employee record" : "Edit employee record";
  const lead =
    role === "admin"
      ? "Employee information associated with one client organisation."
      : "Employee information for your organisation.";

  return (
    <div
      className="org-dialog-root"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        className="org-dialog-backdrop"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        className="org-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="org-dialog-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            <p className="lead org-dialog-lead">{lead}</p>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </IconButton>
        </header>

        <form className="org-dialog-form form-compact" onSubmit={onSubmit}>
          <div className="org-dialog-body">
            {error ? <div className="error-banner">{error}</div> : null}

            <div className="form-grid">
              {role === "admin" ? (
                <div className="field field-full">
                  <label htmlFor="emp-org">
                    Client company <span className="req">*</span>
                  </label>
                  <PortalSelect
                    id="emp-org"
                    aria-label="Client company"
                    value={form.organisationId}
                    searchable
                    disabled={mode === "edit"}
                    options={orgs.map((o) => ({ value: o.id, label: o.name }))}
                    placeholder="Select company…"
                    onChange={(v) => setForm((f) => ({ ...f, organisationId: v }))}
                  />
                </div>
              ) : null}

              <div className="field">
                <label htmlFor="emp-name">
                  Employee name <span className="req">*</span>
                </label>
                <input
                  id="emp-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Full name"
                  required
                  autoFocus
                />
              </div>
              <div className="field">
                <label htmlFor="emp-ref">Employee reference</label>
                <input
                  id="emp-ref"
                  value={form.ref}
                  onChange={(e) => setForm((f) => ({ ...f, ref: e.target.value }))}
                  placeholder="Auto-generated if blank"
                />
              </div>

              <div className="field">
                <label htmlFor="emp-job">
                  Job title <span className="req">*</span>
                </label>
                <input
                  id="emp-job"
                  value={form.jobTitle}
                  onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))}
                  placeholder="Role or job title"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="emp-dept">Department / service</label>
                <input
                  id="emp-dept"
                  value={form.department}
                  onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                  placeholder="Department or service"
                />
              </div>

              <div className="field">
                <label htmlFor="emp-start">Employment start date</label>
                <input
                  id="emp-start"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <StatusLiquidToggle
                label="Employment status"
                name="emp-status"
                value={form.status}
                onChange={(status) => setForm((f) => ({ ...f, status }))}
              />

              <div className="field field-full">
                <label htmlFor="emp-email">Work email (optional)</label>
                <input
                  id="emp-email"
                  type="email"
                  value={form.workEmail}
                  onChange={(e) => setForm((f) => ({ ...f, workEmail: e.target.value }))}
                  placeholder="name@company.com"
                />
              </div>
              <div className="field field-full">
                <label htmlFor="emp-notes">Relevant notes (optional)</label>
                <textarea
                  id="emp-notes"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Context for DM.HR (not shared as employee login)"
                />
              </div>
            </div>
          </div>

          <footer className="org-dialog-foot">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? "Saving…" : mode === "create" ? "Save employee" : "Save changes"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};
