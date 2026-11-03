"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  Briefcase,
  CircleCheck,
  ClipboardList,
  Eye,
  FileText,
  FolderOpen,
  KeyRound,
  Mail,
  Pencil,
  Phone,
  UserRound,
  Users,
} from "lucide-react";
import { AccessCredentialsBanner } from "../../../../components/AccessCredentialsBanner";
import { AppShell } from "../../../../components/AppShell";
import { FilePreviewSheet, type FilePreviewTarget } from "../../../../components/FilePreviewSheet";
import { IconButton } from "../../../../components/IconButton";
import { PortalSelect } from "../../../../components/PortalSelect";
import { StatusLiquidToggle } from "../../../../components/StatusLiquidToggle";
import {
  ProfileActivityPanel,
  type ProfileActivityRow,
} from "../../../../components/ProfileActivityPanel";
import { RowActionsMenu } from "../../../../components/RowActionsMenu";
import { PanelSkeleton } from "../../../../components/Skeleton";
import { useConfirm } from "../../../../context/ConfirmContext";
import { useToast } from "../../../../context/ToastContext";
import {
  mailStatusLabel,
  readAccessCredentials,
  storeAccessCredentials,
  type AccessCredentialsPayload,
} from "../../../../lib/access-credentials";
import { API_URL, apiFetch, type PublicUser } from "../../../../lib/api";
import { clearSession, getStoredUser, getToken, homeForUser } from "../../../../lib/auth";
import { caseBadgeTone, statusLabel } from "../../../../lib/cases";
import { adminNav } from "../../../../lib/nav";
import { isSignedLibraryDocument } from "../../../../lib/documents";
import {
  onboardingOrgLabel,
  onboardingRunLabel,
  packProgress,
} from "../../../../lib/onboarding";
import {
  ORG_REGULATORY_OPTIONS,
  ORG_TYPE_OPTIONS,
  clientAccessAction,
  clientAccessActionLabel,
  isOtherOption,
  orgInitials,
  orgOnboardingSummary,
  orgStatusLabel,
  resolveOptionValue,
  splitStoredOption,
  type OrgDetail,
} from "../../../../lib/organisations";

const hydrateOrgForm = (o: OrgDetail) => {
  const typeParts = splitStoredOption(o.type, ORG_TYPE_OPTIONS);
  const regParts = splitStoredOption(o.regulatoryContext, ORG_REGULATORY_OPTIONS);
  return {
    name: o.name,
    ref: o.ref || "",
    contactName: o.contactName || "",
    email: o.email || "",
    phone: o.phone || "",
    type: typeParts.preset,
    typeOther: typeParts.other,
    regulatoryContext: regParts.preset,
    regulatoryOther: regParts.other,
    status: o.status || "active",
  };
};

const AdminOrganisationProfilePage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { error: toastError, success: toastSuccess, info: toastInfo } = useToast();
  const { confirm } = useConfirm();
  const params = useParams();
  const orgId = String(params.id || "");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editUrlConsumed, setEditUrlConsumed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [startingOnboarding, setStartingOnboarding] = useState(false);
  const [resendingInvite, setResendingInvite] = useState(false);
  const [busyStatus, setBusyStatus] = useState(false);
  const [preview, setPreview] = useState<FilePreviewTarget | null>(null);
  const [accessCreds, setAccessCreds] = useState<AccessCredentialsPayload | null>(null);
  const [form, setForm] = useState({
    name: "",
    ref: "",
    contactName: "",
    email: "",
    phone: "",
    type: "",
    typeOther: "",
    regulatoryContext: "",
    regulatoryOther: "",
    status: "active",
  });

  const load = useCallback(async () => {
    const token = getToken();
    if (!token || !orgId) return;
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<{ organisation: OrgDetail }>(
        `/admin/organisations/${orgId}`,
        { token }
      );
      if (!result.success) {
        if (result.error.code === "PASSWORD_CHANGE_REQUIRED") {
          router.replace("/change-password");
          return;
        }
        if (result.error.code === "UNAUTHORIZED" || result.error.code === "FORBIDDEN") {
          clearSession();
          router.replace("/login");
          return;
        }
        setError(result.error.message);
        setOrg(null);
        return;
      }
      const o = result.data.organisation;
      setOrg(o);
      setForm(hydrateOrgForm(o));
    } catch {
      setError("Unable to load organisation.");
    } finally {
      setLoading(false);
    }
  }, [orgId, router]);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored) {
      router.replace("/login");
      return;
    }
    if (stored.role !== "admin") {
      router.replace(homeForUser(stored));
      return;
    }
    if (stored.mustChangePassword) {
      router.replace("/change-password");
      return;
    }
    setUser(stored);
    load();
  }, [router, load]);

  useEffect(() => {
    if (!orgId) return;
    setAccessCreds(readAccessCredentials(orgId));
    setEditUrlConsumed(false);
  }, [orgId]);

  const clearEditQuery = useCallback(() => {
    if (searchParams.get("edit") !== "1") return;
    router.replace(`/admin/organisations/${orgId}`);
  }, [orgId, router, searchParams]);

  useEffect(() => {
    if (!org || loading || editUrlConsumed) return;
    if (searchParams.get("edit") === "1") {
      setEditing(true);
      setEditUrlConsumed(true);
    }
  }, [org, loading, searchParams, editUrlConsumed]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    if (isOtherOption(form.type) && !form.typeOther.trim()) {
      const msg = "Please specify the organisation type.";
      setError(msg);
      toastError(msg);
      setSaving(false);
      return;
    }
    if (isOtherOption(form.regulatoryContext) && !form.regulatoryOther.trim()) {
      const msg = "Please specify the regulatory context.";
      setError(msg);
      toastError(msg);
      setSaving(false);
      return;
    }
    try {
      const result = await apiFetch<{ organisation: OrgDetail }>(
        `/admin/organisations/${orgId}`,
        {
          method: "PATCH",
          token: getToken(),
          body: JSON.stringify({
            name: form.name,
            ref: form.ref || null,
            contactName: form.contactName || null,
            email: form.email || null,
            phone: form.phone || null,
            type: resolveOptionValue(form.type, form.typeOther) || null,
            regulatoryContext:
              resolveOptionValue(form.regulatoryContext, form.regulatoryOther) || null,
            status: form.status,
          }),
        }
      );
      if (!result.success) {
        setError(result.error.message);
        toastError(result.error.message);
        return;
      }
      setNotice("Organisation updated.");
      toastSuccess("Organisation updated.");
      setEditing(false);
      clearEditQuery();
      await load();
    } catch {
      setError("Unable to save organisation.");
      toastError("Unable to save organisation.");
    } finally {
      setSaving(false);
    }
  }

  async function startOnboarding() {
    if (!org) return;
    setStartingOnboarding(true);
    setError("");
    try {
      const existing = org.latestOnboardingRun;
      if (existing && existing.status === "in_progress") {
        router.push(`/admin/onboarding/${existing.id}`);
        return;
      }
      const result = await apiFetch<{ run: { id: string } }>("/admin/onboarding/runs", {
        method: "POST",
        token: getToken(),
        body: JSON.stringify({ organisationId: org.id }),
      });
      if (!result.success) {
        setError(result.error.message);
        toastError(result.error.message);
        return;
      }
      toastSuccess("Onboarding started.");
      router.push(`/admin/onboarding/${result.data.run.id}`);
    } catch {
      setError("Unable to start onboarding.");
      toastError("Unable to start onboarding.");
    } finally {
      setStartingOnboarding(false);
    }
  }

  async function sendPrimaryAccessLink() {
    if (!org?.users[0]) return;
    const primary = org.users[0];
    if (primary.status !== "active") {
      toastError("Primary client login is disabled — enable the user first.");
      return;
    }
    const action = clientAccessAction(primary);
    if (action === "reset") {
      const ok = await confirm({
        title: "Send password reset?",
        description: `Send a password reset link to ${primary.email}? They can choose a new password.`,
        confirmLabel: "Send reset",
      });
      if (!ok) return;
    }
    setResendingInvite(true);
    setError("");
    setNotice("");
    try {
      const result = await apiFetch<{
        inviteUrl: string;
        mailStatus?: "sent" | "skipped" | "failed" | string;
        purpose?: "invite" | "reset";
      }>(`/admin/users/${primary.id}/invite`, {
        method: "POST",
        token: getToken(),
      });
      if (!result.success) {
        setError(result.error.message);
        toastError(result.error.message);
        return;
      }
      const mailStatus = result.data.mailStatus || "skipped";
      const purpose = result.data.purpose || action;
      const creds: AccessCredentialsPayload = {
        organisationId: org.id,
        organisationName: org.name,
        clientEmail: primary.email,
        clientName: primary.name,
        authMode: "invite",
        purpose,
        inviteUrl: result.data.inviteUrl,
        temporaryPassword: null,
        mailStatus,
        createdAt: new Date().toISOString(),
      };
      storeAccessCredentials(creds);
      setAccessCreds(creds);
      const doneMsg =
        purpose === "reset"
          ? `Password reset sent for ${primary.email}.`
          : `Invite refreshed for ${primary.email}.`;
      setNotice(doneMsg);
      toastSuccess(doneMsg);
      if (mailStatus === "sent") toastSuccess(mailStatusLabel(mailStatus));
      else if (mailStatus === "failed") toastError(mailStatusLabel(mailStatus));
      else toastInfo(mailStatusLabel(mailStatus));
    } catch {
      const failMsg =
        action === "reset" ? "Unable to send password reset." : "Unable to resend invite.";
      setError(failMsg);
      toastError(failMsg);
    } finally {
      setResendingInvite(false);
    }
  }

  async function setOrgStatus(status: "active" | "inactive") {
    if (!org) return;
    const label = status === "inactive" ? "Deactivate" : "Activate";
    const ok = await confirm({
      title: `${label} client?`,
      description:
        status === "inactive"
          ? `Deactivate ${org.name}? Client users keep accounts but the organisation is marked inactive.`
          : `Activate ${org.name}?`,
      confirmLabel: label,
      tone: status === "inactive" ? "danger" : "default",
    });
    if (!ok) return;
    setBusyStatus(true);
    try {
      const result = await apiFetch<{ organisation: OrgDetail }>(
        `/admin/organisations/${org.id}`,
        {
          method: "PATCH",
          token: getToken(),
          body: JSON.stringify({ status }),
        }
      );
      if (!result.success) {
        toastError(result.error.message);
        return;
      }
      toastSuccess(status === "inactive" ? `${org.name} deactivated.` : `${org.name} activated.`);
      await load();
    } catch {
      toastError("Unable to update organisation status.");
    } finally {
      setBusyStatus(false);
    }
  }

  if (!user) return null;

  const run = org?.latestOnboardingRun;
  const hasActiveRun = run?.status === "in_progress";
  const showOnboardingCta = org?.onboardingStatus === "in_progress";
  const pack = run
    ? packProgress({
        ...run,
        organisationId: orgId,
        welcomeEmailSentAt: null,
        welcomeEmailSubject: null,
        welcomeEmailBody: null,
        organisation: {
          id: orgId,
          name: org?.name || "",
          onboardingStatus: org?.onboardingStatus || "in_progress",
        },
        paymentLinks: [],
        packItems: run.packItems.map((p) => ({
          id: p.id,
          title: "",
          requiresSignature: p.requiresSignature,
          status: p.status,
          sortOrder: 0,
          clientDocumentId: null,
          signatureRequestId: null,
        })),
      })
    : null;
  const onboardingTileLabel = !org
    ? "—"
    : run
      ? onboardingRunLabel(run.status)
      : onboardingOrgLabel(org.onboardingStatus);
  const onboardSummary = org ? orgOnboardingSummary(org) : null;
  const metaBits = org
    ? [org.ref, org.type, org.regulatoryContext].filter(Boolean)
    : [];
  const primary = org?.users[0];

  const docRows: ProfileActivityRow[] =
    org?.recentDocuments.map((doc) => ({
      id: doc.id,
      title: doc.title,
      meta: [doc.folder?.name, doc.latestVersion?.fileName].filter(Boolean).join(" · ") || "—",
      badge: isSignedLibraryDocument({
        title: doc.title,
        isSignedCopy: doc.isSignedCopy,
      })
        ? "Signed"
        : undefined,
      badgeTone: "ok",
      actions: (
        <div className="profile-activity-actions">
          {doc.latestVersion ? (
            <IconButton
              label="Preview"
              aria-label={`Preview ${doc.title}`}
              onClick={() =>
                setPreview({
                  title: doc.title,
                  url: `${API_URL}/admin/organisations/${org.id}/documents/${doc.id}/download`,
                  fileName: doc.latestVersion?.fileName,
                  mimeType: doc.latestVersion?.mimeType,
                })
              }
            >
              <Eye size={15} strokeWidth={1.75} />
            </IconButton>
          ) : null}
          <IconButton
            href={`/admin/documents?org=${encodeURIComponent(org.id)}`}
            label="Open in Documents"
            aria-label={`Open ${doc.title} in Documents`}
          >
            <FileText size={15} strokeWidth={1.75} />
          </IconButton>
        </div>
      ),
    })) || [];

  const caseRows: ProfileActivityRow[] =
    org?.recentCases.map((c) => ({
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
    })) || [];

  return (
    <AppShell user={user} nav={adminNav} title={org?.name || "Client profile"}>
      {error ? <div className="error-banner">{error}</div> : null}
      {notice ? <div className="success-banner">{notice}</div> : null}
      {accessCreds ? (
        <AccessCredentialsBanner
          credentials={accessCreds}
          onDismiss={() => setAccessCreds(null)}
        />
      ) : null}

      {loading ? (
        <div className="panel">
          <PanelSkeleton lines={6} />
        </div>
      ) : null}

      {org && !loading ? (
        <>
          <div className="profile-hub-head">
            <div className="profile-hub-head-main">
              <IconButton
                href="/admin/organisations"
                label="Back"
                aria-label="Back to client directory"
                side="bottom"
              >
                <ArrowLeft size={16} strokeWidth={1.75} />
              </IconButton>
              <div className="profile-hub-titles">
                <h1>{org.name}</h1>
                <div className="profile-hub-meta">
                  {metaBits.length ? metaBits.join(" · ") : "No reference yet"}
                  <span className={`status-pill status-pill-${org.status}`}>
                    {orgStatusLabel(org.status)}
                  </span>
                </div>
              </div>
            </div>
            <div className="profile-hub-actions">
              {showOnboardingCta ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={startingOnboarding}
                  onClick={startOnboarding}
                >
                  {hasActiveRun ? "Open onboarding" : "Start onboarding"}
                </button>
              ) : null}
              <RowActionsMenu
                label={`Actions for ${org.name}`}
                items={[
                  {
                    id: "edit",
                    label: editing ? "Editing…" : "Edit",
                    icon: <Pencil size={14} strokeWidth={1.75} />,
                    disabled: editing,
                    onSelect: () => setEditing(true),
                  },
                  {
                    id: "access",
                    label: resendingInvite
                      ? "Sending…"
                      : clientAccessActionLabel(clientAccessAction(primary)),
                    icon: <KeyRound size={14} strokeWidth={1.75} />,
                    disabled:
                      resendingInvite || !primary || primary.status !== "active",
                    onSelect: () => sendPrimaryAccessLink(),
                  },
                  {
                    id: "docs",
                    label: "Open documents",
                    icon: <FolderOpen size={14} strokeWidth={1.75} />,
                    onSelect: () =>
                      router.push(`/admin/documents?org=${encodeURIComponent(org.id)}`),
                  },
                  {
                    id: "toggle",
                    label: org.status === "active" ? "Deactivate" : "Activate",
                    icon:
                      org.status === "active" ? (
                        <Ban size={14} strokeWidth={1.75} />
                      ) : (
                        <CircleCheck size={14} strokeWidth={1.75} />
                      ),
                    tone: org.status === "active" ? "danger" : "default",
                    separatorBefore: true,
                    disabled: busyStatus,
                    onSelect: () =>
                      setOrgStatus(org.status === "active" ? "inactive" : "active"),
                  },
                ]}
              />
            </div>
          </div>

          {showOnboardingCta && !hasActiveRun ? (
            <p className="lead org-flow-hint">
              Starting onboarding creates a run only. Issue the pack from Onboarding to send
              documents into My Onboarding.
            </p>
          ) : null}

          <section className="panel profile-hub-hero">
            {!editing ? (
              <>
                <div className="profile-row">
                  <div className="profile-avatar" aria-hidden>
                    {orgInitials(org.name)}
                  </div>
                  <div className="profile-hero-main">
                    <div className="profile-meta-grid">
                      <div className="profile-meta-item" title="Primary contact">
                        <UserRound size={14} strokeWidth={1.75} aria-hidden />
                        <span>{org.contactName || primary?.name || "—"}</span>
                      </div>
                      <div className="profile-meta-item" title="Company email">
                        <Mail size={14} strokeWidth={1.75} aria-hidden />
                        <span>{org.email || "—"}</span>
                      </div>
                      <div className="profile-meta-item" title="Telephone">
                        <Phone size={14} strokeWidth={1.75} aria-hidden />
                        <span>{org.phone || "—"}</span>
                      </div>
                      <div className="profile-meta-item" title="Client login">
                        <KeyRound size={14} strokeWidth={1.75} aria-hidden />
                        <span>
                          {primary ? `${primary.name} · ${primary.email}` : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <IconButton
                    label="Edit"
                    aria-label="Edit organisation"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil size={15} strokeWidth={1.75} />
                  </IconButton>
                </div>
              </>
            ) : (
              <form className="form-compact" onSubmit={onSave}>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="editName">Company name</label>
                    <input
                      id="editName"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="editRef">Reference</label>
                    <input
                      id="editRef"
                      value={form.ref}
                      onChange={(e) => setForm({ ...form, ref: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="editContact">Primary contact</label>
                    <input
                      id="editContact"
                      value={form.contactName}
                      onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="editEmail">Company email</label>
                    <input
                      id="editEmail"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="editPhone">Telephone</label>
                    <input
                      id="editPhone"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="editType">Organisation type</label>
                    <PortalSelect
                      id="editType"
                      aria-label="Organisation type"
                      value={form.type}
                      placeholder="Select type"
                      options={[
                        { value: "", label: "Select type" },
                        ...ORG_TYPE_OPTIONS.map((t) => ({ value: t, label: t })),
                      ]}
                      onChange={(type) =>
                        setForm({
                          ...form,
                          type,
                          typeOther: isOtherOption(type) ? form.typeOther : "",
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="editReg">Regulatory context</label>
                    <PortalSelect
                      id="editReg"
                      aria-label="Regulatory context"
                      value={form.regulatoryContext}
                      placeholder="Select context"
                      options={[
                        { value: "", label: "Select context" },
                        ...ORG_REGULATORY_OPTIONS.map((t) => ({ value: t, label: t })),
                      ]}
                      onChange={(regulatoryContext) =>
                        setForm({
                          ...form,
                          regulatoryContext,
                          regulatoryOther: isOtherOption(regulatoryContext)
                            ? form.regulatoryOther
                            : "",
                        })
                      }
                    />
                  </div>
                  {isOtherOption(form.type) ? (
                    <div className="field">
                      <label htmlFor="editTypeOther">Specify organisation type</label>
                      <input
                        id="editTypeOther"
                        value={form.typeOther}
                        onChange={(e) => setForm({ ...form, typeOther: e.target.value })}
                        placeholder="Type the organisation type"
                        required
                      />
                    </div>
                  ) : null}
                  {isOtherOption(form.regulatoryContext) ? (
                    <div className="field">
                      <label htmlFor="editRegOther">Specify regulatory context</label>
                      <input
                        id="editRegOther"
                        value={form.regulatoryOther}
                        onChange={(e) => setForm({ ...form, regulatoryOther: e.target.value })}
                        placeholder="Type the regulator or context"
                        required
                      />
                    </div>
                  ) : null}
                  <StatusLiquidToggle
                    name="edit-status"
                    label="Status"
                    value={form.status as "active" | "inactive"}
                    onChange={(status) => setForm({ ...form, status })}
                  />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setEditing(false);
                      setForm(hydrateOrgForm(org));
                      clearEditQuery();
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </section>

          <div className="profile-hub-metrics">
            <Link
              href={`/admin/documents?org=${encodeURIComponent(org.id)}`}
              className="profile-metric"
            >
              <FileText className="profile-metric-icon" size={14} strokeWidth={1.75} aria-hidden />
              <div className="profile-metric-value">{org.documentCount ?? 0}</div>
              <div className="profile-metric-label">Documents</div>
            </Link>
            <Link
              href={`/admin/employees?org=${encodeURIComponent(org.id)}`}
              className="profile-metric"
            >
              <Users className="profile-metric-icon" size={14} strokeWidth={1.75} aria-hidden />
              <div className="profile-metric-value">{org.employeeCount ?? 0}</div>
              <div className="profile-metric-label">Employees</div>
            </Link>
            <Link
              href={`/admin/cases?org=${encodeURIComponent(org.id)}&open=1`}
              className="profile-metric"
            >
              <Briefcase className="profile-metric-icon" size={14} strokeWidth={1.75} aria-hidden />
              <div className="profile-metric-value">{org.openCaseCount ?? 0}</div>
              <div className="profile-metric-label">Open cases</div>
            </Link>
            <Link
              href={run ? `/admin/onboarding/${run.id}` : "/admin/onboarding"}
              className="profile-metric"
            >
              <ClipboardList
                className="profile-metric-icon"
                size={14}
                strokeWidth={1.75}
                aria-hidden
              />
              <div className="profile-metric-value is-text">{onboardingTileLabel}</div>
              <div className="profile-metric-label">
                {pack ? `Pack ${pack.done}/${pack.total}` : "Onboarding"}
              </div>
              {onboardSummary && onboardSummary.total > 0 ? (
                <div className="profile-metric-bar" aria-hidden>
                  <span style={{ width: `${onboardSummary.percent}%` }} />
                </div>
              ) : null}
            </Link>
          </div>

          <div className="grid-2">
            <ProfileActivityPanel
              title="Documents"
              hrefAll={`/admin/documents?org=${encodeURIComponent(org.id)}`}
              allLabel="Open documents folder"
              empty="No documents yet."
              rows={docRows}
            />
            <ProfileActivityPanel
              title="Recent cases"
              hrefAll={`/admin/cases?org=${encodeURIComponent(org.id)}`}
              allLabel="View all cases"
              empty="No cases for this organisation yet."
              rows={caseRows}
            />
          </div>

          <section className="panel profile-users">
            <div className="profile-users-head">
              <h2>Company users</h2>
              <Link
                href={`/admin/users?org=${encodeURIComponent(org.id)}`}
                className="profile-icon-link"
                aria-label="Open user management for this company"
                title="Manage users"
              >
                <Users size={15} strokeWidth={1.75} />
              </Link>
            </div>
            {org.users.length === 0 ? (
              <p className="profile-activity-empty">No company users yet.</p>
            ) : (
              org.users.map((u) => (
                <div key={u.id} className="profile-user-row">
                  <span className="profile-user-avatar" aria-hidden>
                    {orgInitials(u.name)}
                  </span>
                  <div className="profile-user-main">
                    <span className="primary-cell">{u.name}</span>
                    <span className="secondary-cell">{u.email}</span>
                  </div>
                  <span
                    className={`status-pill status-pill-${u.status === "active" ? "active" : "inactive"}`}
                  >
                    {u.status}
                  </span>
                </div>
              ))
            )}
          </section>
        </>
      ) : null}

      <FilePreviewSheet target={preview} onClose={() => setPreview(null)} />
    </AppShell>
  );
};

export default function AdminOrganisationProfileRoute() {
  return (
    <Suspense
      fallback={
        <main className="auth-shell">
          <p className="lead">Loading…</p>
        </main>
      }
    >
      <AdminOrganisationProfilePage />
    </Suspense>
  );
}
