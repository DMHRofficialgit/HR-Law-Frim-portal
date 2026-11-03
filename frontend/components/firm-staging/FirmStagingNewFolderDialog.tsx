"use client";

import { useEffect, useId, useState, type FormEvent, type ReactElement } from "react";
import { X } from "lucide-react";
import { IconButton } from "../IconButton";

type FirmStagingNewFolderDialogProps = {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void> | void;
};

export const FirmStagingNewFolderDialog = ({
  open,
  busy = false,
  onClose,
  onCreate,
}: FirmStagingNewFolderDialogProps): ReactElement | null => {
  const titleId = useId();
  const inputId = useId();
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
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
  }, [open, busy, onClose]);

  if (!open) return null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const next = name.trim();
    if (!next || busy) return;
    await onCreate(next);
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
            <h2 id={titleId}>New vault folder</h2>
            <p className="lead org-dialog-lead">
              Creates a firm-only staging folder. Sending to a client still uses one of the six
              Documents folders.
            </p>
          </div>
          <IconButton label="Close" disabled={busy} onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </IconButton>
        </header>
        <form className="org-dialog-form form-compact" onSubmit={onSubmit}>
          <div className="org-dialog-body">
            <div className="field field-full">
              <label htmlFor={inputId}>
                Folder name <span className="req">*</span>
              </label>
              <input
                id={inputId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                required
                autoFocus
                disabled={busy}
                placeholder="e.g. Adult care templates"
              />
            </div>
          </div>
          <footer className="org-dialog-foot">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={busy || name.trim().length < 2}
            >
              {busy ? "Creating…" : "Create folder"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};
