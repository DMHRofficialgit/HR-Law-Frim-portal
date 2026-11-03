"use client";

import { FormEvent, useEffect, useId, useState, type ReactElement } from "react";
import { X } from "lucide-react";
import { useToast } from "../context/ToastContext";
import { apiFetch } from "../lib/api";
import { getToken } from "../lib/auth";
import type { PortalUserRow, UserCreateCredentials } from "../lib/users";
import { ChoiceToggle } from "./ChoiceToggle";
import { IconButton } from "./IconButton";
import { PortalSelect } from "./PortalSelect";

type OrgOption = { id: string; name: string };

type UserFormDialogProps = {
  open: boolean;
  /** Admin can create admins or company users; client only company users in their org. */
  scope: "admin" | "client";
  orgs?: OrgOption[];
  initialOrganisationId?: string;
  onClose: () => void;
  onCreated: (result: UserCreateCredentials) => void;
};

type FormState = {
  name: string;
  email: string;
  role: "admin" | "client";
  organisationId: string;
  authMode: "invite" | "temporary_password";
  temporaryPassword: string;
};

const emptyForm = (organisationId = ""): FormState => ({
  name: "",
  email: "",
  role: "client",
  organisationId,
  authMode: "invite",
  temporaryPassword: "",
});

export const UserFormDialog = ({
  open,
  scope,
  orgs = [],
  initialOrganisationId = "",
  onClose,
  onCreated,
}: UserFormDialogProps): ReactElement | null => {
  const titleId = useId();
  const { error: toastError } = useToast();
  const [form, setForm] = useState<FormState>(emptyForm(initialOrganisationId));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (scope === "admin" && initialOrganisationId) {
      setForm({ ...emptyForm(initialOrganisationId), role: "client" });
    } else if (scope === "admin") {
      setForm({ ...emptyForm(), role: "admin" });
    } else {
      setForm({ ...emptyForm(), role: "client" });
    }
    setError("");
  }, [open, scope, initialOrganisationId]);

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
    setError("");

    if (!form.name.trim() || !form.email.trim()) {
      const msg = "Name and email are required.";
      setError(msg);
      toastError(msg);
      return;
    }
    if (scope === "admin" && form.role === "client" && !form.organisationId) {
      const msg = "Select a company for this user.";
      setError(msg);
      toastError(msg);
      return;
    }
    if (form.authMode === "temporary_password" && form.temporaryPassword.length < 8) {
      const msg = "Temporary password must be at least 8 characters.";
      setError(msg);
      toastError(msg);
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        email: form.email.trim(),
        authMode: form.authMode,
      };
      if (scope === "admin") {
        body.role = form.role;
        if (form.role === "client") body.organisationId = form.organisationId;
      }
      if (form.authMode === "temporary_password") {
        body.temporaryPassword = form.temporaryPassword;
      }

      const path = scope === "admin" ? "/admin/users" : "/client/users";
      const result = await apiFetch<{
        user: PortalUserRow;
        inviteUrl: string | null;
        temporaryPassword: string | null;
        authMode: string;
        mailStatus?: string;
      }>(path, {
        method: "POST",
        token: getToken(),
        body: JSON.stringify(body),
      });

      if (!result.success) {
        setError(result.error.message);
        toastError(result.error.message);
        return;
      }

      onCreated({
        user: result.data.user,
        inviteUrl: result.data.inviteUrl,
        temporaryPassword: result.data.temporaryPassword,
        authMode: result.data.authMode,
        mailStatus: result.data.mailStatus,
      });
      onClose();
    } catch {
      const msg = "Unable to create user.";
      setError(msg);
      toastError(msg);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const title = scope === "admin" ? "Create user" : "Add company user";
  const lead =
    scope === "admin"
      ? "Add a DM.HR admin or a company user. Each person logs in with their own email."
      : "Invite another login for your company. Each person uses their own email.";

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
              <div className="field">
                <label htmlFor="user-dialog-name">Full name</label>
                <input
                  id="user-dialog-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  autoFocus
                />
              </div>
              <div className="field">
                <label htmlFor="user-dialog-email">Email</label>
                <input
                  id="user-dialog-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>
            </div>

            {scope === "admin" ? (
              <>
                <ChoiceToggle
                  name="user-role"
                  label="Role"
                  value={form.role}
                  options={[
                    { value: "admin", label: "DM.HR admin" },
                    { value: "client", label: "Company user" },
                  ]}
                  onChange={(role) =>
                    setForm((f) => ({
                      ...f,
                      role,
                      organisationId: role === "admin" ? "" : f.organisationId,
                    }))
                  }
                />
                {form.role === "client" ? (
                  <div className="field">
                    <label>Organisation</label>
                    <PortalSelect
                      aria-label="Organisation"
                      value={form.organisationId}
                      searchable
                      required
                      placeholder="Select company"
                      options={[
                        { value: "", label: "Select company" },
                        ...orgs.map((o) => ({ value: o.id, label: o.name })),
                      ]}
                      onChange={(organisationId) =>
                        setForm((f) => ({ ...f, organisationId }))
                      }
                    />
                  </div>
                ) : null}
              </>
            ) : null}

            <ChoiceToggle
              name="user-auth"
              label="Auth"
              value={form.authMode}
              options={[
                { value: "invite", label: "Invite link" },
                { value: "temporary_password", label: "Temporary password" },
              ]}
              onChange={(authMode) => setForm((f) => ({ ...f, authMode }))}
            />
            <p className="org-meta" style={{ marginTop: -4, marginBottom: 12 }}>
              We’ll email this address if SMTP is set up. You’ll also get a copyable link or
              password after create.
            </p>

            {form.authMode === "temporary_password" ? (
              <div className="field">
                <label htmlFor="user-dialog-temp">Temporary password</label>
                <input
                  id="user-dialog-temp"
                  value={form.temporaryPassword}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, temporaryPassword: e.target.value }))
                  }
                  minLength={8}
                  required
                />
              </div>
            ) : null}
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
              {saving ? "Creating…" : scope === "admin" ? "Create user" : "Add user"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};
