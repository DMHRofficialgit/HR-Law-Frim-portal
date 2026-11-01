"use client";

import { FormEvent, useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { useToast } from "../context/ToastContext";
import { apiFetch, type PublicUser } from "../lib/api";
import { getToken } from "../lib/auth";
import {
  ORG_REGULATORY_OPTIONS,
  ORG_TYPE_OPTIONS,
  isOtherOption,
  resolveOptionValue,
  type AddOrganisationPayload,
} from "../lib/organisations";
import { ChoiceToggle } from "./ChoiceToggle";

type CreateResult = {
  organisation: { id: string; name: string };
  clientUser: PublicUser;
  authMode: string;
  inviteUrl: string | null;
  temporaryPassword: string | null;
  mailStatus?: "sent" | "skipped" | "failed" | string;
};

type AddOrganisationDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (result: CreateResult) => void;
};

const emptyForm = {
  name: "",
  ref: "",
  contactName: "",
  email: "",
  phone: "",
  type: "",
  typeOther: "",
  regulatoryContext: "",
  regulatoryOther: "",
  clientName: "",
  clientEmail: "",
  authMode: "invite" as "invite" | "temporary_password",
  temporaryPassword: "",
  onboardingStatus: "in_progress" as "in_progress" | "existing_skip",
};

export function AddOrganisationDialog({
  open,
  onClose,
  onCreated,
}: AddOrganisationDialogProps) {
  const titleId = useId();
  const toast = useToast();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm);
    setError("");
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

    if (isOtherOption(form.type) && !form.typeOther.trim()) {
      const msg = "Please specify the organisation type.";
      setError(msg);
      toast.error(msg);
      return;
    }
    if (isOtherOption(form.regulatoryContext) && !form.regulatoryOther.trim()) {
      const msg = "Please specify the regulatory context.";
      setError(msg);
      toast.error(msg);
      return;
    }

    setCreating(true);
    try {
      const payload: AddOrganisationPayload = {
        name: form.name,
        ref: form.ref || undefined,
        contactName: form.contactName || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        type: resolveOptionValue(form.type, form.typeOther) || undefined,
        regulatoryContext:
          resolveOptionValue(form.regulatoryContext, form.regulatoryOther) || undefined,
        clientName: form.clientName,
        clientEmail: form.clientEmail,
        authMode: form.authMode,
        temporaryPassword:
          form.authMode === "temporary_password" ? form.temporaryPassword : undefined,
        onboardingStatus: form.onboardingStatus,
      };

      const result = await apiFetch<CreateResult>("/admin/organisations", {
        method: "POST",
        token: getToken(),
        body: JSON.stringify(payload),
      });

      if (!result.success) {
        setError(result.error.message);
        toast.error(result.error.message);
        return;
      }
      onCreated(result.data);
      onClose();
    } catch {
      setError("Unable to create organisation.");
      toast.error("Unable to create organisation.");
    } finally {
      setCreating(false);
    }
  }

  if (!open) return null;

  const showTypeOther = isOtherOption(form.type);
  const showRegOther = isOtherOption(form.regulatoryContext);

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
            <h2 id={titleId}>Add a client</h2>
            <p className="lead org-dialog-lead">
              Creates the company, client login, and document folders. Does not start onboarding
              or send pack documents yet.
            </p>
          </div>
          <button
            type="button"
            className="shell-icon-btn"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </header>

        <form className="org-dialog-form form-compact" onSubmit={onSubmit}>
          <div className="org-dialog-body">
          {error ? <div className="error-banner">{error}</div> : null}

          <div className="form-grid">
            <div className="field field-full">
              <label htmlFor="add-org-name">Company name</label>
              <input
                id="add-org-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Riverside Care Group"
                required
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="add-org-contact">Primary contact</label>
              <input
                id="add-org-contact"
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="add-org-email">Company email</label>
              <input
                id="add-org-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="add-org-phone">Telephone</label>
              <input
                id="add-org-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="add-org-ref">Reference</label>
              <input
                id="add-org-ref"
                value={form.ref}
                onChange={(e) => setForm({ ...form, ref: e.target.value })}
                placeholder="Auto if blank"
              />
            </div>

            <ChoiceToggle
              name="add-client-type"
              label="Client type"
              value={form.onboardingStatus}
              onChange={(onboardingStatus) => setForm({ ...form, onboardingStatus })}
              options={[
                { value: "in_progress", label: "New client" },
                { value: "existing_skip", label: "Already onboarded" },
              ]}
            />

            <div className="field">
              <label htmlFor="add-org-type">Organisation type</label>
              <select
                id="add-org-type"
                value={form.type}
                onChange={(e) =>
                  setForm({
                    ...form,
                    type: e.target.value,
                    typeOther: isOtherOption(e.target.value) ? form.typeOther : "",
                  })
                }
              >
                <option value="">Select type</option>
                {ORG_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="add-org-reg">Regulatory context</label>
              <select
                id="add-org-reg"
                value={form.regulatoryContext}
                onChange={(e) =>
                  setForm({
                    ...form,
                    regulatoryContext: e.target.value,
                    regulatoryOther: isOtherOption(e.target.value)
                      ? form.regulatoryOther
                      : "",
                  })
                }
              >
                <option value="">Select context</option>
                {ORG_REGULATORY_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {showTypeOther ? (
              <div className="field">
                <label htmlFor="add-org-type-other">Specify organisation type</label>
                <input
                  id="add-org-type-other"
                  value={form.typeOther}
                  onChange={(e) => setForm({ ...form, typeOther: e.target.value })}
                  placeholder="Type the organisation type"
                  required
                />
              </div>
            ) : null}
            {showRegOther ? (
              <div className="field">
                <label htmlFor="add-org-reg-other">Specify regulatory context</label>
                <input
                  id="add-org-reg-other"
                  value={form.regulatoryOther}
                  onChange={(e) => setForm({ ...form, regulatoryOther: e.target.value })}
                  placeholder="Type the regulator or context"
                  required
                />
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="add-client-name">Client login name</label>
              <input
                id="add-client-name"
                value={form.clientName}
                onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="add-client-email">Client login email</label>
              <input
                id="add-client-email"
                type="email"
                value={form.clientEmail}
                onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
                required
              />
            </div>

            <ChoiceToggle
              name="add-auth-mode"
              label="Access method"
              value={form.authMode}
              onChange={(authMode) => {
                setForm({
                  ...form,
                  authMode,
                  temporaryPassword:
                    authMode === "temporary_password" ? form.temporaryPassword : "",
                });
                if (authMode === "temporary_password") {
                  requestAnimationFrame(() => {
                    document.getElementById("add-temp-password")?.scrollIntoView({
                      block: "nearest",
                      behavior: "smooth",
                    });
                  });
                }
              }}
              options={[
                { value: "invite", label: "Email invite" },
                { value: "temporary_password", label: "Temp password" },
              ]}
            />

            {form.authMode === "temporary_password" ? (
              <div className="field field-full">
                <label htmlFor="add-temp-password">Temporary password</label>
                <input
                  id="add-temp-password"
                  type="text"
                  value={form.temporaryPassword}
                  onChange={(e) => setForm({ ...form, temporaryPassword: e.target.value })}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </div>
            ) : null}
          </div>
          </div>

          <footer className="org-dialog-foot">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>
              {creating ? "Creating…" : "Create client"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
