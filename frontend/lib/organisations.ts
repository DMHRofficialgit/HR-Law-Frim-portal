export type OrgClientUser = {
  id: string;
  email: string;
  name: string;
  status: string;
  mustChangePassword: boolean;
  passwordChangedAt?: string | null;
  createdAt?: string;
};

/** First-time invite vs admin password reset (after password was set). */
export const clientAccessAction = (
  user: Pick<OrgClientUser, "passwordChangedAt"> | null | undefined
): "invite" | "reset" => (user?.passwordChangedAt ? "reset" : "invite");

export const clientAccessActionLabel = (action: "invite" | "reset"): string =>
  action === "reset" ? "Send password reset" : "Resend invite";

export type OrgListRow = {
  id: string;
  name: string;
  ref: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  type: string | null;
  regulatoryContext?: string | null;
  onboardingStatus: string;
  status: string;
  users: OrgClientUser[];
  openCaseCount?: number;
  employeeCount?: number;
  documentCount?: number;
  latestOnboardingRun?: {
    id: string;
    status: string;
    packItems: Array<{ id: string; status: string; requiresSignature: boolean }>;
  } | null;
};

/** Mock-aligned list; "Other" reveals a specify field. */
export const ORG_REGULATORY_OPTIONS = [
  "To Be Confirmed",
  "CQC",
  "Ofsted",
  "Both",
  "Not Applicable",
  "Other",
] as const;

/** Mock-aligned list; Other* options reveal a specify field. */
export const ORG_TYPE_OPTIONS = [
  "Adult Social Care",
  "Children's Residential Care",
  "Other Care Provider",
  "Other Business",
] as const;

export type AddOrganisationPayload = {
  name: string;
  ref?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  type?: string;
  regulatoryContext?: string;
  clientName: string;
  clientEmail: string;
  authMode: "invite" | "temporary_password";
  temporaryPassword?: string;
  onboardingStatus: "in_progress" | "existing_skip";
};

export type OrgRecentCase = {
  id: string;
  ref: string;
  title: string;
  status: string;
  updatedAt: string;
};

export type OrgRecentDocument = {
  id: string;
  title: string;
  currentVersion: number;
  isSignedCopy?: boolean;
  updatedAt: string;
  folder: { id: string; name: string; key: string } | null;
  latestVersion: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  } | null;
};

export type OrgLatestOnboardingRun = {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  packItems: Array<{ id: string; status: string; requiresSignature: boolean }>;
} | null;

export type OrgDetail = OrgListRow & {
  latestOnboardingRun: OrgLatestOnboardingRun;
  recentCases: OrgRecentCase[];
  recentDocuments: OrgRecentDocument[];
};

export const isOtherOption = (value: string): boolean =>
  value === "Other" || value.startsWith("Other ");

export const resolveOptionValue = (preset: string, otherText: string): string => {
  if (!preset) return "";
  if (isOtherOption(preset) && otherText.trim()) return otherText.trim();
  return preset;
};

export const splitStoredOption = (
  stored: string | null | undefined,
  options: readonly string[]
): { preset: string; other: string } => {
  const value = (stored || "").trim();
  if (!value) return { preset: "", other: "" };
  if (options.includes(value)) return { preset: value, other: "" };
  const otherPreset =
    options.find((o) => o === "Other") ||
    options.find((o) => o.startsWith("Other ")) ||
    "";
  return { preset: otherPreset, other: value };
};

export function orgStatusLabel(status: string): string {
  if (status === "active") return "Active";
  if (status === "inactive") return "Inactive";
  return status.replace(/_/g, " ");
}

export function orgInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const packItemDone = (status: string): boolean =>
  status === "done" || status === "signed" || status === "reviewed";

/** Directory onboarding cell: short label + optional pack progress. */
export function orgOnboardingSummary(org: OrgListRow): {
  tone: "progress" | "done" | "skip" | "needs";
  label: string;
  done: number;
  total: number;
  percent: number;
} {
  const run = org.latestOnboardingRun;
  if (org.onboardingStatus === "completed" || run?.status === "completed") {
    const total = run?.packItems.length || 0;
    const done = total
      ? run!.packItems.filter((p) => packItemDone(p.status)).length
      : 0;
    return {
      tone: "done",
      label: total ? `Complete · ${done}/${total}` : "Complete",
      done: total || 1,
      total: total || 1,
      percent: 100,
    };
  }
  if (org.onboardingStatus === "existing_skip") {
    return { tone: "skip", label: "Skipped", done: 0, total: 0, percent: 0 };
  }
  if (run && run.packItems.length > 0) {
    const total = run.packItems.length;
    const done = run.packItems.filter((p) => packItemDone(p.status)).length;
    const percent = Math.round((done / total) * 100);
    return {
      tone: "progress",
      label: `Pack ${done}/${total}`,
      done,
      total,
      percent,
    };
  }
  if (run) {
    return { tone: "progress", label: "Run started", done: 0, total: 1, percent: 8 };
  }
  return { tone: "needs", label: "Needs start", done: 0, total: 0, percent: 0 };
}
