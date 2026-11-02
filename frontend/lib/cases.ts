export const CASE_STATUSES = [
  { value: "submitted", label: "Submitted" },
  { value: "allocated", label: "Allocated" },
  { value: "in_progress", label: "In progress" },
  { value: "information_required", label: "Information required" },
  { value: "final_stages", label: "Final stages" },
  { value: "closed", label: "Closed" },
] as const;

export type CaseStatusValue = (typeof CASE_STATUSES)[number]["value"];

export type CaseKpiKey = "all" | "received" | "pending" | "closed";

export type CaseCategory = {
  id: string;
  name: string;
  active?: boolean;
};

export type CaseOrg = {
  id: string;
  name: string;
  ref?: string | null;
};

export type CaseEmployee = {
  id: string;
  name: string;
  ref?: string | null;
};

export type CaseMessage = {
  id: string;
  body: string;
  visibility: string;
  createdAt: string;
  author: { id?: string; name: string; role: string } | null;
};

export type CaseAttachment = {
  id: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt?: string;
  uploadedById?: string | null;
  uploadedBy?: { id: string; name: string; email?: string } | null;
};

export type CaseRow = {
  id: string;
  ref: string;
  title: string;
  description?: string;
  peopleInvolved?: string | null;
  investigation?: string | null;
  outcome?: string | null;
  status: string;
  categoryId?: string;
  categoryOther?: string | null;
  employeeId?: string | null;
  organisationId?: string;
  createdAt: string;
  updatedAt: string;
  category: { id?: string; name: string };
  organisation?: CaseOrg;
  employee: CaseEmployee | null;
  createdBy?: { id: string; name: string; role: string } | null;
  messages?: CaseMessage[];
  attachments?: CaseAttachment[];
  _count?: { messages: number; attachments: number };
};

export type CaseFormValues = {
  organisationId: string;
  title: string;
  description: string;
  categoryId: string;
  categoryOther: string;
  employeeId: string;
  peopleInvolved: string;
  investigation: string;
  outcome: string;
};

export const emptyCaseForm = (organisationId = ""): CaseFormValues => ({
  organisationId,
  title: "",
  description: "",
  categoryId: "",
  categoryOther: "",
  employeeId: "",
  peopleInvolved: "",
  investigation: "",
  outcome: "",
});

export const caseToFormValues = (c: CaseRow): CaseFormValues => ({
  organisationId: c.organisationId || c.organisation?.id || "",
  title: c.title || "",
  description: c.description || "",
  categoryId: c.categoryId || c.category?.id || "",
  categoryOther: c.categoryOther || "",
  employeeId: c.employeeId || c.employee?.id || "",
  peopleInvolved: c.peopleInvolved || "",
  investigation: c.investigation || "",
  outcome: c.outcome || "",
});

export const isOtherCaseCategory = (name: string | null | undefined): boolean =>
  (name || "").trim().toLowerCase() === "other";

export const categoryDisplayName = (
  category: { name?: string } | null | undefined,
  categoryOther?: string | null
): string => {
  const name = category?.name || "—";
  if (isOtherCaseCategory(name) && (categoryOther || "").trim()) {
    return `Other — ${categoryOther!.trim()}`;
  }
  return name;
};

export function statusLabel(status: string): string {
  return CASE_STATUSES.find((s) => s.value === status)?.label || status.replace(/_/g, " ");
}

export function caseBadgeTone(status: string): "ok" | "progress" | "muted" | "warn" {
  if (status === "closed") return "muted";
  if (status === "information_required") return "warn";
  if (status === "submitted" || status === "allocated") return "ok";
  return "progress";
}

export function displayOrNotRecorded(value: string | null | undefined): string {
  const t = (value || "").trim();
  return t || "Not recorded yet";
}

export function hasCaseField(value: string | null | undefined): boolean {
  return Boolean((value || "").trim());
}

export function formatCaseDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatCaseDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Received ≈ submitted; Pending = open work; Closed = closed */
export function caseMatchesKpi(status: string, kpi: CaseKpiKey): boolean {
  if (kpi === "all") return true;
  if (kpi === "closed") return status === "closed";
  if (kpi === "received") return status === "submitted";
  return status !== "closed" && status !== "submitted";
}

export function countCasesByKpi(cases: Array<{ status: string }>): Record<CaseKpiKey, number> {
  return {
    all: cases.length,
    received: cases.filter((c) => caseMatchesKpi(c.status, "received")).length,
    pending: cases.filter((c) => caseMatchesKpi(c.status, "pending")).length,
    closed: cases.filter((c) => caseMatchesKpi(c.status, "closed")).length,
  };
}

export function isSystemCaseMessage(body: string): boolean {
  const b = body.trim().toLowerCase();
  return (
    b.startsWith("status updated") ||
    b === "case submitted." ||
    b === "case opened by dm.hr group." ||
    b.startsWith("case received")
  );
}

export type CaseMessageKind = "system" | "private" | "client";

export type CaseMessageDayGroup = {
  key: string;
  label: string;
  items: CaseMessage[];
};

export function caseMessageKind(m: {
  body: string;
  visibility: string;
}): CaseMessageKind {
  if (isSystemCaseMessage(m.body)) return "system";
  if (m.visibility === "admin_only") return "private";
  return "client";
}

export function caseMessageTitle(
  m: { body: string; visibility: string; author?: { role?: string } | null },
  role: "admin" | "client" = "admin"
): string {
  const kind = caseMessageKind(m);
  if (kind === "system") return m.body.replace(/\.$/, "").trim() || "System update";
  if (kind === "private") return "Internal note";
  if (role === "client" && m.author?.role === "client") return "Reply";
  return "Update";
}

export function formatCaseRelativeTime(
  value: string | null | undefined,
  nowMs: number = Date.now()
): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";

  const diffMs = nowMs - d.getTime();
  if (diffMs < 0) return formatCaseDate(value);

  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfMsg = new Date(d);
  startOfMsg.setHours(0, 0, 0, 0);
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfMsg.getTime()) / 86400000
  );
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) return `${dayDiff}d ago`;

  const sameYear = d.getFullYear() === new Date(nowMs).getFullYear();
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

const dayKey = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const dayLabel = (d: Date, now = new Date()): string => {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfMsg = new Date(d);
  startOfMsg.setHours(0, 0, 0, 0);
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfMsg.getTime()) / 86400000
  );
  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

/** Newest-first (audit / activity order): latest events at top. */
export function groupCaseMessagesByDay(
  messages: CaseMessage[]
): CaseMessageDayGroup[] {
  const sorted = [...messages].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const map = new Map<string, CaseMessageDayGroup>();
  const now = new Date();

  for (const m of sorted) {
    const d = new Date(m.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = dayKey(d);
    const existing = map.get(key);
    if (existing) {
      existing.items.push(m);
    } else {
      map.set(key, { key, label: dayLabel(d, now), items: [m] });
    }
  }

  return Array.from(map.values());
}
