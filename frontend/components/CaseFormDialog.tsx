"use client";

import {
  FormEvent,
  useEffect,
  useId,
  useState,
  type ReactElement,
} from "react";
import { X } from "lucide-react";
import { useToast } from "../context/ToastContext";
import { API_URL, apiFetch } from "../lib/api";
import { getToken } from "../lib/auth";
import {
  caseToFormValues,
  emptyCaseForm,
  isOtherCaseCategory,
  type CaseCategory,
  type CaseFormValues,
  type CaseRow,
} from "../lib/cases";
import { DocsDropzone } from "./DocsDropzone";
import { IconButton } from "./IconButton";
import { PortalSelect } from "./PortalSelect";

type OrgOption = { id: string; name: string };
type EmployeeOption = { id: string; name: string; status?: string };

const EMPTY_ORGS: OrgOption[] = [];

type CaseFormDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  role: "admin" | "client";
  orgs?: OrgOption[];
  categories: CaseCategory[];
  initialOrganisationId?: string;
  initialEmployeeId?: string;
  caseRow?: CaseRow | null;
  onClose: () => void;
  onSaved: (c: CaseRow) => void;
};

export const CaseFormDialog = ({
  open,
  mode,
  role,
  orgs = EMPTY_ORGS,
  categories,
  initialOrganisationId = "",
  initialEmployeeId = "",
  caseRow = null,
  onClose,
  onSaved,
}: CaseFormDialogProps): ReactElement | null => {
  const titleId = useId();
  const toast = useToast();
  const [form, setForm] = useState<CaseFormValues>(emptyCaseForm());
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingEmps, setLoadingEmps] = useState(false);

  const caseId = caseRow?.id || "";
  const firstOrgId = orgs[0]?.id || "";
  const firstCategoryId = categories[0]?.id || "";

  // Reset form when dialog opens (or when switching the edited case).
  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && caseRow) {
      setForm(caseToFormValues(caseRow));
    } else {
      const orgId = initialOrganisationId || firstOrgId || "";
      const next = emptyCaseForm(orgId);
      next.categoryId = firstCategoryId || "";
      next.employeeId = initialEmployeeId || "";
      setForm(next);
    }
    setFiles([]);
    setError("");
    // caseRow read on open/caseId change only — avoid depending on object identity
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable reset keys above
  }, [open, mode, caseId, initialOrganisationId, initialEmployeeId, firstOrgId, firstCategoryId]);

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

  useEffect(() => {
    if (!open) return;
    const token = getToken();
    if (!token) return;

    const orgId =
      role === "admin"
        ? form.organisationId ||
          caseRow?.organisationId ||
          caseRow?.organisation?.id ||
          ""
        : mode === "edit"
          ? caseRow?.organisationId || caseRow?.organisation?.id || ""
          : "";

    if (role === "admin" && !orgId) {
      setEmployees([]);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoadingEmps(true);
      const path =
        role === "admin"
          ? `/admin/employees?organisationId=${encodeURIComponent(orgId)}&status=active`
          : "/client/employees?status=active";
      const result = await apiFetch<{ employees: EmployeeOption[] }>(path, { token });
      if (cancelled) return;
      if (result.success) {
        const list = result.data.employees;
        setEmployees(list);
        setForm((f) => {
          if (f.employeeId && list.some((e) => e.id === f.employeeId)) return f;
          if (mode === "edit") return f;
          if (initialEmployeeId && list.some((e) => e.id === initialEmployeeId)) {
            return { ...f, employeeId: initialEmployeeId };
          }
          return f;
        });
      } else {
        setEmployees([]);
      }
      setLoadingEmps(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    role,
    form.organisationId,
    mode,
    caseRow?.organisationId,
    caseRow?.organisation?.id,
    initialEmployeeId,
  ]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (role === "admin" && mode === "create" && !form.organisationId) {
      const msg = "Select a client organisation.";
      setError(msg);
      toast.error(msg);
      return;
    }
    if (!form.title.trim() || !form.description.trim()) {
      const msg = "Title and issue / supporting information are required.";
      setError(msg);
      toast.error(msg);
      return;
    }
    if (!form.categoryId) {
      const msg = "Category is required.";
      setError(msg);
      toast.error(msg);
      return;
    }

    const selectedCategory = categories.find((c) => c.id === form.categoryId);
    const otherSelected = isOtherCaseCategory(selectedCategory?.name);
    if (otherSelected && !form.categoryOther.trim()) {
      const msg = "Specify the category when Other is selected.";
      setError(msg);
      toast.error(msg);
      return;
    }

    setSaving(true);
    try {
      if (mode === "create") {
        const body = new FormData();
        if (role === "admin") body.append("organisationId", form.organisationId);
        body.append("title", form.title.trim());
        body.append("description", form.description.trim());
        body.append("categoryId", form.categoryId);
        if (otherSelected) body.append("categoryOther", form.categoryOther.trim());
        body.append("employeeId", form.employeeId || "");
        if (form.peopleInvolved.trim()) {
          body.append("peopleInvolved", form.peopleInvolved.trim());
        }
        if (form.investigation.trim()) {
          body.append("investigation", form.investigation.trim());
        }
        if (form.outcome.trim()) {
          body.append("outcome", form.outcome.trim());
        }
        files.forEach((f) => body.append("files", f));

        const path = role === "admin" ? "/admin/cases" : "/client/cases";
        const res = await fetch(`${API_URL}${path}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
          body,
        });
        const json = await res.json();
        if (!json.success) {
          const msg = json.error?.message || "Unable to create case";
          setError(msg);
          toast.error(msg);
          return;
        }
        toast.success(role === "admin" ? "Case created" : "Case submitted");
        onSaved(json.data.case as CaseRow);
        onClose();
        return;
      }

      if (!caseRow) return;

      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim(),
        peopleInvolved: form.peopleInvolved.trim() || null,
        employeeId: form.employeeId || null,
        categoryId: form.categoryId,
        categoryOther: otherSelected ? form.categoryOther.trim() : null,
      };

      if (role === "admin") {
        payload.investigation = form.investigation.trim() || null;
        payload.outcome = form.outcome.trim() || null;
      }

      const path =
        role === "admin" ? `/admin/cases/${caseRow.id}` : `/client/cases/${caseRow.id}`;
      const result = await apiFetch<{ case: CaseRow }>(path, {
        method: "PATCH",
        token: getToken(),
        body: JSON.stringify(payload),
      });

      if (!result.success) {
        setError(result.error.message);
        toast.error(result.error.message);
        return;
      }

      toast.success("Case updated");
      onSaved(result.data.case);
      onClose();
    } catch {
      const msg = "Unable to save case.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const title = mode === "create" ? "Create case" : "Edit case overview";
  const lead =
    role === "admin"
      ? mode === "create"
        ? "Open an employment case for a client organisation."
        : "Update overview fields for this case."
      : mode === "create"
        ? "Submit an employment case with supporting information."
        : "Update issue details and people involved.";

  const activeEmployees = employees.filter((e) => e.status !== "inactive");
  const empOptions = [
    { value: "", label: "No related employee" },
    ...(activeEmployees.length ? activeEmployees : employees).map((e) => ({
      value: e.id,
      label: e.name,
    })),
  ];
  const selectedCategory = categories.find((c) => c.id === form.categoryId);
  const otherSelected = isOtherCaseCategory(selectedCategory?.name);

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
              {role === "admin" && mode === "create" ? (
                <div className="field field-full">
                  <label htmlFor="case-org">
                    Client organisation <span className="req">*</span>
                  </label>
                  <PortalSelect
                    id="case-org"
                    aria-label="Client organisation"
                    value={form.organisationId}
                    searchable
                    options={orgs.map((o) => ({ value: o.id, label: o.name }))}
                    placeholder="Select organisation…"
                    onChange={(v) =>
                      setForm((f) => ({ ...f, organisationId: v, employeeId: "" }))
                    }
                  />
                </div>
              ) : null}

              <div className="field field-full">
                <label htmlFor="case-title">
                  Case title <span className="req">*</span>
                </label>
                <input
                  id="case-title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Short case title"
                  required
                  autoFocus
                />
              </div>

              <div className="field">
                <label htmlFor="case-cat">
                  Category <span className="req">*</span>
                </label>
                <PortalSelect
                  id="case-cat"
                  aria-label="Category"
                  value={form.categoryId}
                  options={categories.map((c) => ({ value: c.id, label: c.name }))}
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      categoryId: v,
                      categoryOther: isOtherCaseCategory(
                        categories.find((c) => c.id === v)?.name
                      )
                        ? f.categoryOther
                        : "",
                    }))
                  }
                />
              </div>

              {otherSelected ? (
                <div className="field field-full">
                  <label htmlFor="case-cat-other">
                    Specify category <span className="req">*</span>
                  </label>
                  <input
                    id="case-cat-other"
                    value={form.categoryOther}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, categoryOther: e.target.value }))
                    }
                    placeholder="Describe the case type"
                    required
                  />
                </div>
              ) : null}

              <div className="field">
                <label htmlFor="case-emp">Related employee (optional)</label>
                <PortalSelect
                  id="case-emp"
                  aria-label="Related employee"
                  value={form.employeeId}
                  searchable={empOptions.length > 8}
                  disabled={loadingEmps}
                  options={empOptions}
                  placeholder={loadingEmps ? "Loading…" : "No related employee"}
                  onChange={(v) => setForm((f) => ({ ...f, employeeId: v }))}
                />
              </div>

              <div className="field field-full">
                <label htmlFor="case-desc">
                  Issue / supporting information <span className="req">*</span>
                </label>
                <textarea
                  id="case-desc"
                  rows={4}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Describe the issue and any supporting context"
                  required
                />
              </div>

              <div className="field field-full">
                <label htmlFor="case-people">People involved / witnesses</label>
                <textarea
                  id="case-people"
                  rows={2}
                  value={form.peopleInvolved}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, peopleInvolved: e.target.value }))
                  }
                  placeholder="Names and roles, if known"
                />
              </div>

              {role === "admin" ? (
                <>
                  <div className="field field-full">
                    <label htmlFor="case-inv">Investigation</label>
                    <textarea
                      id="case-inv"
                      rows={2}
                      value={form.investigation}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, investigation: e.target.value }))
                      }
                      placeholder="Leave blank if not recorded yet"
                    />
                  </div>
                  <div className="field field-full">
                    <label htmlFor="case-out">Outcome</label>
                    <textarea
                      id="case-out"
                      rows={2}
                      value={form.outcome}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, outcome: e.target.value }))
                      }
                      placeholder="Leave blank if not recorded yet"
                    />
                  </div>
                </>
              ) : null}

              {mode === "create" ? (
                <div className="field field-full">
                  <label>Attachments (optional)</label>
                  <DocsDropzone
                    compact
                    accept=".pdf,application/pdf"
                    hint="PDF only · drag and drop or select"
                    title="Drop attachments here"
                    selectLabel="Select files"
                    onFiles={(picked) =>
                      setFiles((prev) => {
                        const names = new Set(prev.map((f) => `${f.name}:${f.size}`));
                        const next = picked.filter(
                          (f) => !names.has(`${f.name}:${f.size}`)
                        );
                        return [...prev, ...next];
                      })
                    }
                  />
                  {files.length > 0 ? (
                    <ul className="docs-file-chips">
                      {files.map((f) => (
                        <li key={`${f.name}-${f.size}`} className="docs-file-chip-item">
                          <span>{f.name}</span>
                          <button
                            type="button"
                            className="docs-file-chip-remove"
                            aria-label={`Remove ${f.name}`}
                            onClick={() =>
                              setFiles((prev) =>
                                prev.filter((x) => !(x.name === f.name && x.size === f.size))
                              )
                            }
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
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
              {saving
                ? "Saving…"
                : mode === "create"
                  ? role === "admin"
                    ? "Create case"
                    : "Submit case"
                  : "Save changes"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};
