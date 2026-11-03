"use client";

import { useEffect, useId, useMemo, useState, type FormEvent, type ReactElement } from "react";
import { X } from "lucide-react";
import { IconButton } from "../IconButton";
import { PortalSelect } from "../PortalSelect";
import {
  FIRM_STAGING_CLIENT_FOLDER_OPTIONS,
  type FirmStagingClientFolderKey,
  type FirmStagingFile,
} from "../../lib/firm-staging";

type OrgOption = { id: string; name: string };

type FirmStagingSendDialogProps = {
  open: boolean;
  files: FirmStagingFile[];
  organisations: OrgOption[];
  defaultFolderKey?: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    organisationId: string;
    folderKey: FirmStagingClientFolderKey;
  }) => Promise<void> | void;
};

export const FirmStagingSendDialog = ({
  open,
  files,
  organisations,
  defaultFolderKey,
  busy = false,
  onClose,
  onSubmit,
}: FirmStagingSendDialogProps): ReactElement | null => {
  const titleId = useId();
  const [organisationId, setOrganisationId] = useState("");
  const [folderKey, setFolderKey] = useState<FirmStagingClientFolderKey>("my_documents");

  const orgOptions = useMemo(
    () => organisations.map((o) => ({ value: o.id, label: o.name })),
    [organisations]
  );

  const fileKey = files.map((f) => f.id).join(",");

  useEffect(() => {
    if (!open) return;
    setOrganisationId(organisations[0]?.id || "");
    const match = FIRM_STAGING_CLIENT_FOLDER_OPTIONS.find(
      (o) => o.value === defaultFolderKey
    );
    setFolderKey(match?.value || "my_documents");
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, organisations, defaultFolderKey, fileKey, busy, onClose]);

  if (!open || files.length === 0) return null;

  const lead =
    files.length === 1 ? (
      <>
        Copy <strong>{files[0].title}</strong> into a client Documents folder. The staging
        original stays in Firm staging.
      </>
    ) : (
      <>
        Copy <strong>{files.length} files</strong> into the same client Documents folder. Staging
        originals stay in Firm staging.
      </>
    );

  const onForm = async (e: FormEvent) => {
    e.preventDefault();
    if (!organisationId || busy) return;
    await onSubmit({ organisationId, folderKey });
  };

  return (
    <div
      className="org-dialog-root"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <button
        type="button"
        className="org-dialog-backdrop"
        aria-label="Close dialog"
        disabled={busy}
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
            <h2 id={titleId}>
              {files.length === 1 ? "Send to client" : `Send ${files.length} to client`}
            </h2>
            <p className="lead org-dialog-lead">{lead}</p>
          </div>
          <IconButton label="Close" disabled={busy} onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </IconButton>
        </header>

        <form className="org-dialog-form form-compact" onSubmit={onForm}>
          <div className="org-dialog-body">
            {files.length > 1 ? (
              <ul className="firm-staging-send-list">
                {files.slice(0, 8).map((f) => (
                  <li key={f.id}>{f.title}</li>
                ))}
                {files.length > 8 ? <li>+{files.length - 8} more</li> : null}
              </ul>
            ) : null}
            <div className="form-grid">
              <div className="field field-full">
                <label htmlFor="firm-staging-send-org">
                  Organisation <span className="req">*</span>
                </label>
                <PortalSelect
                  id="firm-staging-send-org"
                  value={organisationId}
                  options={orgOptions}
                  onChange={setOrganisationId}
                  aria-label="Organisation"
                  searchable
                  placeholder="Select company…"
                />
              </div>
              <div className="field field-full">
                <label htmlFor="firm-staging-send-folder">
                  Target folder <span className="req">*</span>
                </label>
                <PortalSelect
                  id="firm-staging-send-folder"
                  value={folderKey}
                  options={FIRM_STAGING_CLIENT_FOLDER_OPTIONS}
                  onChange={(v) => setFolderKey(v as FirmStagingClientFolderKey)}
                  aria-label="Target folder"
                />
              </div>
            </div>
          </div>
          <footer className="org-dialog-foot">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={busy || !organisationId}
            >
              {busy
                ? "Sending…"
                : files.length === 1
                  ? "Copy to client"
                  : `Copy ${files.length} to client`}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};
