"use client";

import { FormEvent, useEffect, useId, useState, type ReactElement } from "react";
import { X } from "lucide-react";
import { useToast } from "../context/ToastContext";
import { apiFetch } from "../lib/api";
import { getToken } from "../lib/auth";
import type { OnboardingRun } from "../lib/onboarding";
import { IconButton } from "./IconButton";
import { PortalSelect } from "./PortalSelect";

type OrgOption = { id: string; name: string; ref?: string | null };

type StartOnboardingDialogProps = {
  open: boolean;
  orgs: OrgOption[];
  onClose: () => void;
  onStarted: (run: OnboardingRun) => void;
};

export const StartOnboardingDialog = ({
  open,
  orgs,
  onClose,
  onStarted,
}: StartOnboardingDialogProps): ReactElement | null => {
  const titleId = useId();
  const { error: toastError } = useToast();
  const [organisationId, setOrganisationId] = useState("");
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  const firstOrgId = orgs[0]?.id || "";

  useEffect(() => {
    if (!open) return;
    setOrganisationId(firstOrgId);
    setError("");
  }, [open, firstOrgId]);

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
    if (!organisationId) {
      const msg = "Select a company to start onboarding.";
      setError(msg);
      toastError(msg);
      return;
    }
    setStarting(true);
    setError("");
    try {
      const result = await apiFetch<{ run: OnboardingRun }>("/admin/onboarding/runs", {
        method: "POST",
        token: getToken(),
        body: JSON.stringify({ organisationId }),
      });
      if (!result.success) {
        setError(result.error.message);
        toastError(result.error.message);
        return;
      }
      onStarted(result.data.run);
      onClose();
    } catch {
      const msg = "Unable to start onboarding.";
      setError(msg);
      toastError(msg);
    } finally {
      setStarting(false);
    }
  }

  if (!open) return null;

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
            <h2 id={titleId}>Start client onboarding</h2>
            <p className="lead org-dialog-lead">
              Creates a checklist for the selected company. Welcome email and Firm Library pack
              are issued on the run detail page.
            </p>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </IconButton>
        </header>

        <form className="org-dialog-form form-compact" onSubmit={onSubmit}>
          <div className="org-dialog-body">
            {error ? <div className="error-banner">{error}</div> : null}
            <div className="form-grid">
              <div className="field field-full">
                <label htmlFor="start-onb-org">
                  Client company <span className="req">*</span>
                </label>
                <PortalSelect
                  id="start-onb-org"
                  aria-label="Client company"
                  value={organisationId}
                  searchable
                  placeholder="Select company…"
                  options={orgs.map((o) => ({
                    value: o.id,
                    label: o.ref ? `${o.name} (${o.ref})` : o.name,
                  }))}
                  onChange={setOrganisationId}
                />
              </div>
            </div>
            {orgs.length === 0 ? (
              <p className="lead" style={{ marginTop: 12, marginBottom: 0 }}>
                No companies waiting to start. Add a client as “Needs onboarding”, or finish an
                active run first.
              </p>
            ) : null}
          </div>
          <footer className="org-dialog-foot">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onClose}
              disabled={starting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={starting || orgs.length === 0 || !organisationId}
            >
              {starting ? "Starting…" : "Start onboarding"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};
