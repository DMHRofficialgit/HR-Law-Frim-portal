export type PackItemStatus =
  | "issued"
  | "awaiting_signature"
  | "signed"
  | "reviewed"
  | "done";

export type JourneyRole = "terms" | "welcome" | "compliance" | "other";

export type OnboardingPackItem = {
  id: string;
  title: string;
  requiresSignature: boolean;
  status: PackItemStatus | string;
  sortOrder: number;
  libraryDocumentId?: string | null;
  clientDocumentId: string | null;
  signatureRequestId: string | null;
  /** Snapshot from Firm Library at issue time */
  journeyRole?: JourneyRole | string | null;
  clientDocument?: { id: string; title: string; folderId: string } | null;
  signatureRequest?: {
    id: string;
    status: string;
    title: string;
    publishedDocuments?: { id: string; title: string }[];
  } | null;
};

export const JOURNEY_ROLE_LABELS: Record<JourneyRole, string> = {
  terms: "Terms of Business",
  welcome: "Welcome pack",
  compliance: "Compliance documents",
  other: "Other",
};

/** Pill class for journey stage (not readiness / Admin ink). */
export const journeyRolePillClass = (role: JourneyRole | string): string => {
  const r = String(role || "other").toLowerCase();
  if (r === "terms") return "firm-pack-role-terms";
  if (r === "welcome") return "firm-pack-role-welcome";
  if (r === "compliance") return "firm-pack-role-compliance";
  return "firm-pack-role-other";
};

export function packPreviewDoc(item: OnboardingPackItem): {
  id: string;
  title: string;
} | null {
  const signed = item.signatureRequest?.publishedDocuments?.[0];
  if (signed?.id) {
    return { id: signed.id, title: signed.title || `${item.title} — Signed` };
  }
  if (item.clientDocumentId) {
    return {
      id: item.clientDocumentId,
      title: item.clientDocument?.title || item.title,
    };
  }
  return null;
}

/** Ceremony stamp exists (all assignees done) — before or after Admin Mark complete. */
export function packCeremonyFullySigned(item: OnboardingPackItem): boolean {
  if (item.status === "signed" || item.status === "reviewed" || item.status === "done") {
    return Boolean(item.signatureRequestId);
  }
  const s = item.signatureRequest?.status;
  return s === "signed_returned" || s === "reviewed";
}

/**
 * Prefer Documents Signed copy when published; else stamped e-sign file once
 * ceremony is complete (safe — does not publish early).
 */
export function packPreviewTarget(
  item: OnboardingPackItem,
  opts: { role: "admin" | "client"; organisationId?: string | null; apiUrl: string }
): { title: string; url: string; fileName: string; mimeType: string } | null {
  const published = item.signatureRequest?.publishedDocuments?.[0];
  if (published?.id) {
    if (opts.role === "admin") {
      if (!opts.organisationId) return null;
      return {
        title: published.title || `${item.title} — Signed`,
        url: `${opts.apiUrl}/admin/organisations/${opts.organisationId}/documents/${published.id}/download`,
        fileName: `${published.title || item.title}.pdf`,
        mimeType: "application/pdf",
      };
    }
    return {
      title: published.title || `${item.title} — Signed`,
      url: `${opts.apiUrl}/client/documents/${published.id}/download`,
      fileName: `${published.title || item.title}.pdf`,
      mimeType: "application/pdf",
    };
  }

  if (packCeremonyFullySigned(item) && item.signatureRequestId) {
    const base = opts.role === "admin" ? "/admin" : "/client";
    const title = `${item.title} — Signed`;
    return {
      title,
      url: `${opts.apiUrl}${base}/signature-requests/${item.signatureRequestId}/file?signed=1`,
      fileName: `${title}.pdf`,
      mimeType: "application/pdf",
    };
  }

  if (item.clientDocumentId) {
    if (opts.role === "admin") {
      if (!opts.organisationId) return null;
      return {
        title: item.clientDocument?.title || item.title,
        url: `${opts.apiUrl}/admin/organisations/${opts.organisationId}/documents/${item.clientDocumentId}/download`,
        fileName: `${item.title}.pdf`,
        mimeType: "application/pdf",
      };
    }
    return {
      title: item.clientDocument?.title || item.title,
      url: `${opts.apiUrl}/client/documents/${item.clientDocumentId}/download`,
      fileName: `${item.title}.pdf`,
      mimeType: "application/pdf",
    };
  }

  return null;
}

export function packAwaitingAdminReview(item: OnboardingPackItem): boolean {
  if (item.status === "signed") return true;
  return item.signatureRequest?.status === "signed_returned";
}

/** Signable pack item that is not fully stamped yet — Preview is unsigned source only. */
export function packPreviewShowsUnsignedSource(item: OnboardingPackItem): boolean {
  if (!item.requiresSignature || !item.signatureRequestId) return false;
  if (packCeremonyFullySigned(item)) return false;
  return Boolean(item.clientDocumentId);
}

export type OnboardingPaymentLink = {
  id: string;
  kind: "direct_debit" | "initial_payment" | string;
  url: string;
  doneAt: string | null;
};

export type OnboardingRun = {
  id: string;
  organisationId: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  welcomeEmailSentAt: string | null;
  welcomeEmailSubject: string | null;
  welcomeEmailBody: string | null;
  organisation: {
    id: string;
    name: string;
    contactName?: string | null;
    email?: string | null;
    onboardingStatus: string;
    users?: { id: string; name: string; email: string }[];
  };
  packItems: OnboardingPackItem[];
  paymentLinks: OnboardingPaymentLink[];
};

export function onboardingOrgLabel(status: string): string {
  if (status === "existing_skip") return "Already onboarded";
  if (status === "in_progress") return "Needs / in progress";
  if (status === "completed") return "Completed";
  return status.replace(/_/g, " ");
}

export function onboardingRunLabel(status: string): string {
  if (status === "in_progress") return "In Progress";
  if (status === "completed") return "Completed";
  return status.replace(/_/g, " ");
}

export function onboardingRunBadgeTone(
  status: string
): "ok" | "progress" | "muted" | "warn" {
  if (status === "completed") return "ok";
  if (status === "in_progress") return "progress";
  return "muted";
}

export function orgInitialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

export function packItemLabel(status: string): string {
  const map: Record<string, string> = {
    issued: "Issued",
    awaiting_signature: "Awaiting signature",
    signed: "Signed — review",
    reviewed: "Reviewed",
    done: "Done",
  };
  return map[status] || status.replace(/_/g, " ");
}

/** Pack row status pill (Admin + Client) — prefer over raw e-sign strings. */
export function packItemStatusPill(item: OnboardingPackItem): {
  label: string;
  tone: "ok" | "progress" | "muted" | "warn";
} {
  if (!item.requiresSignature) {
    return { label: "Complete", tone: "ok" };
  }
  if (packAwaitingAdminReview(item) || item.status === "signed") {
    return { label: "Needs review", tone: "warn" };
  }
  if (item.status === "reviewed" || item.status === "done") {
    return { label: "Complete", tone: "ok" };
  }
  const esign = item.signatureRequest?.status;
  if (
    item.status === "awaiting_signature" ||
    esign === "awaiting_signature" ||
    esign === "sent" ||
    esign === "revision_requested"
  ) {
    return { label: "Awaiting signature", tone: "progress" };
  }
  return { label: "Pending", tone: "muted" };
}

export function packItemDone(item: OnboardingPackItem): boolean {
  if (!item.requiresSignature) {
    return item.status === "done" || item.status === "reviewed";
  }
  return item.status === "reviewed" || item.status === "done";
}

export function packProgress(run: OnboardingRun): { done: number; total: number } {
  const total = run.packItems.length;
  const done = run.packItems.filter((p) => packItemDone(p)).length;
  return { done, total };
}

export function paymentUrl(
  run: OnboardingRun,
  kind: "direct_debit" | "initial_payment"
): string {
  return run.paymentLinks.find((p) => p.kind === kind)?.url || "";
}

export function packJourneyRole(item: OnboardingPackItem): JourneyRole {
  const raw = String(item.journeyRole || "").toLowerCase();
  if (raw === "terms" || raw === "welcome" || raw === "compliance" || raw === "other") {
    return raw;
  }
  // Legacy packs (pre-role): infer from title so existing data still maps.
  if (/terms/i.test(item.title)) return "terms";
  if (/welcome/i.test(item.title)) return "welcome";
  if (/compliance|gap analysis|data protection|hr support/i.test(item.title)) {
    return "compliance";
  }
  return "other";
}

/** Welcome pack stage: email + all pack docs (roles are filenames, not stages). */
export function welcomePackStage(run: OnboardingRun): {
  status: string;
  done: boolean;
} {
  const emailSent = Boolean(run.welcomeEmailSentAt);
  const hasPack = run.packItems.length > 0;
  const packDone = hasPack && run.packItems.every((p) => packItemDone(p));
  const done = emailSent && packDone;

  if (done) return { status: "Complete", done: true };
  if (!emailSent && !hasPack) return { status: "Not started", done: false };
  if (!hasPack) return { status: "Email sent · pack pending", done: false };
  if (!emailSent) return { status: "Pack issued · email pending", done: false };

  const needsReview = run.packItems.some((p) => packAwaitingAdminReview(p));
  if (needsReview) return { status: "Needs review", done: false };

  const awaiting = run.packItems.some(
    (p) =>
      p.requiresSignature &&
      !packItemDone(p) &&
      !packAwaitingAdminReview(p)
  );
  if (awaiting) return { status: "Awaiting signature", done: false };

  return { status: "In progress", done: false };
}

/** @deprecated Prefer welcomePackStage — kept for call-site migration. */
export function termsStatus(run: OnboardingRun): string {
  return welcomePackStage(run).status;
}

/**
 * Four functional stages (Phase B): Welcome pack · DD · Payment · Admin Complete.
 * Terms / Compliance titles are pack filenames, not separate stages.
 */
export function journeyStages(run: OnboardingRun): Array<{
  key: string;
  name: string;
  status: string;
  done: boolean;
}> {
  const pack = welcomePackStage(run);
  const dd = Boolean(paymentUrl(run, "direct_debit"));
  const pay = Boolean(paymentUrl(run, "initial_payment"));
  const complete = run.status === "completed";

  return [
    {
      key: "welcome_pack",
      name: "Welcome pack",
      status: pack.status,
      done: pack.done,
    },
    {
      key: "dd",
      name: "Direct Debit setup",
      status: dd ? "Link ready" : "Awaiting link",
      done: dd,
    },
    {
      key: "payment",
      name: "Initial payment",
      status: pay ? "Link ready" : "Awaiting link",
      done: pay,
    },
    {
      key: "complete",
      name: "Admin marks Complete",
      status: complete ? "Full DM.HR client" : "Pending Admin",
      done: complete,
    },
  ];
}
