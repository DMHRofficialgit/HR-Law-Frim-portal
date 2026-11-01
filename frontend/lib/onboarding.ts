export type PackItemStatus =
  | "issued"
  | "awaiting_signature"
  | "signed"
  | "reviewed"
  | "done";

export type OnboardingPackItem = {
  id: string;
  title: string;
  requiresSignature: boolean;
  status: PackItemStatus | string;
  sortOrder: number;
  libraryDocumentId?: string | null;
  clientDocumentId: string | null;
  signatureRequestId: string | null;
  clientDocument?: { id: string; title: string; folderId: string } | null;
  signatureRequest?: { id: string; status: string; title: string } | null;
};

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

export function packItemDone(item: OnboardingPackItem): boolean {
  if (!item.requiresSignature) {
    return item.status === "done" || item.status === "reviewed";
  }
  return item.status === "reviewed" || item.status === "done";
}

export function termsStatus(run: OnboardingRun): string {
  const terms =
    run.packItems.find((p) => /terms/i.test(p.title) && p.requiresSignature) ||
    run.packItems.find((p) => p.requiresSignature);
  if (!terms) return "Not issued";
  return packItemLabel(terms.status);
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

/** Six functional stages for journey UI (HTML structure + Decisions). */
export function journeyStages(run: OnboardingRun): Array<{
  key: string;
  name: string;
  status: string;
  done: boolean;
}> {
  const pack = packProgress(run);
  const hasTermsIssued = run.packItems.some(
    (p) => p.requiresSignature || /terms/i.test(p.title)
  );
  const termsDone = run.packItems
    .filter((p) => p.requiresSignature)
    .every((p) => packItemDone(p));
  const welcomeIssued = run.packItems.some((p) => /welcome/i.test(p.title));
  const complianceIssued = run.packItems.some((p) =>
    /compliance|gap|information|checklist/i.test(p.title)
  );
  const hasAnyPack = run.packItems.length > 0;
  const dd = Boolean(paymentUrl(run, "direct_debit"));
  const pay = Boolean(paymentUrl(run, "initial_payment"));
  const complete = run.status === "completed";

  return [
    {
      key: "terms",
      name: "Terms of Business (sign online)",
      status: !hasTermsIssued
        ? "Not issued"
        : termsDone
          ? "Complete"
          : termsStatus(run),
      done: hasTermsIssued && termsDone,
    },
    {
      key: "welcome",
      name: "Welcome pack",
      status: welcomeIssued || hasAnyPack ? "In My Onboarding" : "Not issued",
      done: welcomeIssued || (hasAnyPack && pack.done > 0),
    },
    {
      key: "compliance",
      name: "Compliance documents",
      status: complianceIssued || hasAnyPack ? "In My Onboarding" : "Not issued",
      done: complianceIssued || pack.done === pack.total && pack.total > 0,
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
