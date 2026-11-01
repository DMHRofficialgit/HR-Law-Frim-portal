"use client";

import { useState, type ReactElement } from "react";
import {
  clearAccessCredentials,
  mailStatusLabel,
  type AccessCredentialsPayload,
} from "../lib/access-credentials";

type AccessCredentialsBannerProps = {
  credentials: AccessCredentialsPayload;
  onDismiss: () => void;
};

export const AccessCredentialsBanner = ({
  credentials,
  onDismiss,
}: AccessCredentialsBannerProps): ReactElement => {
  const [copied, setCopied] = useState("");

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(""), 1600);
    } catch {
      setCopied("");
    }
  }

  function dismiss() {
    clearAccessCredentials();
    onDismiss();
  }

  const value =
    credentials.authMode === "invite"
      ? credentials.inviteUrl || ""
      : credentials.temporaryPassword || "";
  const valueLabel =
    credentials.authMode === "temporary_password"
      ? "Temporary password"
      : credentials.purpose === "reset"
        ? "Password reset link"
        : "Invite link";

  return (
    <section className="panel access-creds" aria-label="Client access credentials">
      <div className="row-between" style={{ gap: 12, alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>Client access</h2>
          <p className="lead" style={{ margin: 0 }}>
            {mailStatusLabel(credentials.mailStatus)} · {credentials.clientEmail}
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={dismiss}>
          Dismiss
        </button>
      </div>

      <div className="access-creds-row">
        <div className="field" style={{ marginBottom: 0, flex: 1 }}>
          <label>{valueLabel}</label>
          <input type="text" readOnly value={value} />
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!value}
          onClick={() => copy(value, "value")}
        >
          {copied === "value" ? "Copied" : "Copy"}
        </button>
      </div>
    </section>
  );
};
