export type EmployeeStatus = "active" | "inactive";

export type EmployeeOrg = {
  id: string;
  name: string;
  ref?: string | null;
};

export type EmployeeCaseSummary = {
  id: string;
  ref: string;
  title: string;
  status: string;
  updatedAt: string;
};

export type EmployeeRow = {
  id: string;
  organisationId: string;
  name: string;
  ref: string | null;
  jobTitle: string | null;
  department: string | null;
  startDate: string | null;
  workEmail: string | null;
  notes: string | null;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  organisation?: EmployeeOrg;
  _count?: { cases: number };
  cases?: EmployeeCaseSummary[];
};

export type EmployeeFormValues = {
  organisationId: string;
  name: string;
  ref: string;
  jobTitle: string;
  department: string;
  startDate: string;
  workEmail: string;
  notes: string;
  status: EmployeeStatus;
};

export const emptyEmployeeForm = (organisationId = ""): EmployeeFormValues => ({
  organisationId,
  name: "",
  ref: "",
  jobTitle: "",
  department: "",
  startDate: "",
  workEmail: "",
  notes: "",
  status: "active",
});

export const employeeStatusLabel = (status: string): string =>
  status === "inactive" ? "Inactive" : "Active";

export const formatEmployeeStartDate = (value: string | null | undefined): string => {
  if (!value) return "—";
  const d = value.slice(0, 10);
  return d || "—";
};

export const employeeInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

export const employeeToFormValues = (emp: EmployeeRow): EmployeeFormValues => ({
  organisationId: emp.organisationId,
  name: emp.name,
  ref: emp.ref || "",
  jobTitle: emp.jobTitle || "",
  department: emp.department || "",
  startDate: emp.startDate ? emp.startDate.slice(0, 10) : "",
  workEmail: emp.workEmail || "",
  notes: emp.notes || "",
  status: emp.status === "inactive" ? "inactive" : "active",
});

export const employeePayloadFromForm = (form: EmployeeFormValues, includeOrg: boolean) => {
  const body: Record<string, unknown> = {
    name: form.name.trim(),
    jobTitle: form.jobTitle.trim(),
    department: form.department.trim() || null,
    startDate: form.startDate || null,
    workEmail: form.workEmail.trim() || null,
    notes: form.notes.trim() || null,
    status: form.status,
    ref: form.ref.trim() || null,
  };
  if (includeOrg) body.organisationId = form.organisationId;
  return body;
};
