export function signatureStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Draft",
    ready_for_send: "Ready to send",
    awaiting_signature: "Awaiting signature",
    signed_returned: "Signed",
    reviewed: "Reviewed",
    revision_requested: "Revision",
    sent: "Awaiting signature",
  };
  return labels[status] || status.replace(/_/g, " ");
}

export type SignatureKpiKey =
  | "all"
  | "needs_you"
  | "ready"
  | "awaiting"
  | "review"
  | "completed";

export type ClientSignatureKpiKey = "all" | "needs_you" | "waiting" | "completed";

export function signatureBadgeTone(
  status: string
): "ok" | "progress" | "warn" | "muted" {
  if (status === "reviewed") return "ok";
  if (status === "signed_returned" || status === "ready_for_send") return "warn";
  if (
    status === "awaiting_signature" ||
    status === "sent" ||
    status === "revision_requested"
  ) {
    return "progress";
  }
  return "muted";
}

export function isAwaitingSignatureStatus(status: string): boolean {
  return (
    status === "awaiting_signature" ||
    status === "sent" ||
    status === "revision_requested"
  );
}

export function onboardingLabel(status: string) {
  if (status === "existing_skip") return "Already onboarded";
  if (status === "in_progress") return "Needs / in progress";
  if (status === "completed") return "Completed";
  return status.replace(/_/g, " ");
}

export function isPdfDocument(mimeType: string | null | undefined, fileName?: string | null) {
  const mime = (mimeType || "").toLowerCase();
  const name = (fileName || "").toLowerCase();
  return mime.includes("pdf") || name.endsWith(".pdf");
}

/** Admin queue: hide completed by default when filtering Active */
export function isActiveSignatureStatus(status: string) {
  return status !== "reviewed";
}

export const SIGNATURE_FIELD_TYPES = [
  "signature",
  "initials",
  "text",
  "date",
  "name",
] as const;

export type SignatureFieldTypeName = (typeof SIGNATURE_FIELD_TYPES)[number];

export type SignatureFieldUser = {
  id: string;
  name: string;
  email: string;
  role?: string;
};

export type SignatureField = {
  id: string;
  type: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  required: boolean;
  sortOrder: number;
  assigneeUserId?: string | null;
  signedByUserId?: string | null;
  valueText?: string | null;
  signedImagePath: string | null;
  signedAt: string | null;
  assignee?: SignatureFieldUser | null;
  signedBy?: SignatureFieldUser | null;
};

export type SignatureCcRecipient = {
  id: string;
  userId: string;
  user: SignatureFieldUser;
};

export type SignatureRequestRow = {
  id: string;
  title: string;
  status: string;
  sourceDocumentId: string | null;
  sourceFileName: string;
  sourceMimeType: string;
  typedName: string | null;
  revisionNote: string | null;
  sentAt: string | null;
  signedAt: string | null;
  reviewedAt: string | null;
  updatedAt: string;
  organisation: { id: string; name: string };
  createdBy: { id: string; name: string; email: string } | null;
  signedBy: { id: string; name: string; email: string } | null;
  reviewedBy: { id: string; name: string; email: string } | null;
  fields: SignatureField[];
  ccRecipients?: SignatureCcRecipient[];
};

export function isPdfRequest(r: { sourceMimeType: string; sourceFileName: string }) {
  return (
    r.sourceMimeType.includes("pdf") || r.sourceFileName.toLowerCase().endsWith(".pdf")
  );
}

/** Place/edit boxes — draft only (frozen after Mark Ready). */
export function canAdminEditFields(status: string) {
  return status === "draft";
}

/**
 * Finish my part unlocked after Mark Ready (admin assignees),
 * and after Send / revision for remaining assignees.
 * Clients only see the request after Send (API filter).
 */
export function canFillFields(status: string) {
  return (
    status === "ready_for_send" ||
    status === "awaiting_signature" ||
    status === "sent" ||
    status === "revision_requested"
  );
}

/** @deprecated use canFillFields */
export function canClientSign(status: string) {
  return canFillFields(status);
}

export function isInkFieldType(type: string) {
  return type === "signature" || type === "initials";
}

export function isTextFieldType(type: string) {
  return type === "text" || type === "date" || type === "name";
}

export function fieldIsComplete(f: {
  required?: boolean;
  type: string;
  signedImagePath?: string | null;
  valueText?: string | null;
  signedAt?: string | null;
}): boolean {
  if (isInkFieldType(f.type)) {
    return Boolean(f.signedImagePath && f.signedAt);
  }
  return Boolean((f.valueText && f.valueText.trim()) || f.signedImagePath) && Boolean(f.signedAt);
}

export function signatureProgress(fields: SignatureField[]): {
  done: number;
  total: number;
  waitingNames: string[];
} {
  const required = fields.filter((f) => f.required !== false);
  const pool = required.length ? required : fields;
  const total = pool.length;
  const done = pool.filter((f) => fieldIsComplete(f)).length;
  const seen = new Set<string>();
  const waitingNames: string[] = [];
  for (const f of pool) {
    if (fieldIsComplete(f)) continue;
    const a = f.assignee;
    if (!a || seen.has(a.id)) continue;
    seen.add(a.id);
    waitingNames.push(a.name || a.email);
  }
  return { done, total, waitingNames };
}

export function defaultLabelForType(type: string): string {
  switch (type) {
    case "initials":
      return "Initials";
    case "text":
      return "Text";
    case "date":
      return "Date";
    case "name":
      return "Name";
    default:
      return "Signature";
  }
}

/** Soft accent colours for assignee boxes (DocuSign-lite). */
export const ASSIGNEE_COLORS = [
  { border: "#1b7a3d", fill: "rgba(27, 122, 61, 0.14)", text: "#14532d" },
  { border: "#2563eb", fill: "rgba(37, 99, 235, 0.14)", text: "#1e3a8a" },
  { border: "#b45309", fill: "rgba(180, 83, 9, 0.14)", text: "#7c2d12" },
  { border: "#7c3aed", fill: "rgba(124, 58, 237, 0.14)", text: "#4c1d95" },
  { border: "#0f766e", fill: "rgba(15, 118, 110, 0.14)", text: "#115e59" },
  { border: "#be123c", fill: "rgba(190, 18, 60, 0.14)", text: "#9f1239" },
] as const;

export function colorForAssignee(userId: string | null | undefined, indexHint = 0) {
  if (!userId) {
    return ASSIGNEE_COLORS[0];
  }
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash + userId.charCodeAt(i) * (i + 1)) % ASSIGNEE_COLORS.length;
  }
  return ASSIGNEE_COLORS[(hash + indexHint) % ASSIGNEE_COLORS.length];
}

export type EsignQueueAction = "prepare" | "send" | "sign" | "review" | "view";

export function esignQueueAction(params: {
  status: string;
  role: "admin" | "client";
  userId: string;
  fields: SignatureField[];
}): { action: EsignQueueAction; label: string } {
  const { status, role, userId, fields } = params;
  const minePending = fields.some(
    (f) =>
      f.assigneeUserId === userId &&
      f.required !== false &&
      !fieldIsComplete(f)
  );

  if (role === "admin") {
    if (status === "draft") return { action: "prepare", label: "Prepare" };
    if (status === "ready_for_send" && minePending) {
      return { action: "sign", label: "Sign" };
    }
    if (status === "ready_for_send") return { action: "send", label: "Send" };
    if (canFillFields(status) && minePending) return { action: "sign", label: "Sign" };
    if (status === "signed_returned") return { action: "review", label: "Review" };
    return { action: "view", label: "View" };
  }

  if (canFillFields(status) && minePending) return { action: "sign", label: "Sign" };
  return { action: "view", label: "View" };
}

export function signatureNeedsYou(params: {
  status: string;
  role: "admin" | "client";
  userId: string;
  fields: SignatureField[];
}): boolean {
  return esignQueueAction(params).action === "sign";
}

export function signatureMatchesKpi(
  r: SignatureRequestRow,
  kpi: SignatureKpiKey,
  role: "admin" | "client",
  userId: string
): boolean {
  if (kpi === "all") return true;
  const needsYou = signatureNeedsYou({
    status: r.status,
    role,
    userId,
    fields: r.fields || [],
  });
  if (kpi === "needs_you") return needsYou;
  if (kpi === "ready") return r.status === "ready_for_send" && !needsYou;
  if (kpi === "awaiting") return isAwaitingSignatureStatus(r.status);
  if (kpi === "review") return r.status === "signed_returned";
  if (kpi === "completed") return r.status === "reviewed";
  return true;
}

export function countSignaturesByKpi(
  requests: SignatureRequestRow[],
  role: "admin" | "client",
  userId: string
): Record<SignatureKpiKey, number> {
  const counts: Record<SignatureKpiKey, number> = {
    all: requests.length,
    needs_you: 0,
    ready: 0,
    awaiting: 0,
    review: 0,
    completed: 0,
  };
  for (const r of requests) {
    if (signatureMatchesKpi(r, "needs_you", role, userId)) counts.needs_you += 1;
    if (signatureMatchesKpi(r, "ready", role, userId)) counts.ready += 1;
    if (signatureMatchesKpi(r, "awaiting", role, userId)) counts.awaiting += 1;
    if (signatureMatchesKpi(r, "review", role, userId)) counts.review += 1;
    if (signatureMatchesKpi(r, "completed", role, userId)) counts.completed += 1;
  }
  return counts;
}

export function clientSignatureMatchesKpi(
  r: SignatureRequestRow,
  kpi: ClientSignatureKpiKey,
  userId: string
): boolean {
  if (kpi === "all") return true;
  const needsYou = signatureNeedsYou({
    status: r.status,
    role: "client",
    userId,
    fields: r.fields || [],
  });
  if (kpi === "needs_you") return needsYou;
  if (kpi === "completed") return r.status === "reviewed";
  if (kpi === "waiting") {
    return !needsYou && r.status !== "reviewed";
  }
  return true;
}

export function countClientSignaturesByKpi(
  requests: SignatureRequestRow[],
  userId: string
): Record<ClientSignatureKpiKey, number> {
  const counts: Record<ClientSignatureKpiKey, number> = {
    all: requests.length,
    needs_you: 0,
    waiting: 0,
    completed: 0,
  };
  for (const r of requests) {
    if (clientSignatureMatchesKpi(r, "needs_you", userId)) counts.needs_you += 1;
    if (clientSignatureMatchesKpi(r, "waiting", userId)) counts.waiting += 1;
    if (clientSignatureMatchesKpi(r, "completed", userId)) counts.completed += 1;
  }
  return counts;
}

export function esignStageLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Draft — place fields";
    case "ready_for_send":
      return "Ready — Finish my part or Send";
    case "awaiting_signature":
    case "sent":
      return "Awaiting signatures";
    case "revision_requested":
      return "Revision — re-sign";
    case "signed_returned":
      return "Signed — admin review";
    case "reviewed":
      return "Complete";
    default:
      return signatureStatusLabel(status);
  }
}
