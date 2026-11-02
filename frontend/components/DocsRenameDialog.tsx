"use client";

import { FormEvent, useEffect, useId, useState, type ReactElement } from "react";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";

type DocsRenameDialogProps = {
  open: boolean;
  currentTitle: string;
  busy?: boolean;
  onClose: () => void;
  onSave: (title: string) => void | Promise<void>;
};

export const DocsRenameDialog = ({
  open,
  currentTitle,
  busy = false,
  onClose,
  onSave,
}: DocsRenameDialogProps): ReactElement | null => {
  const titleId = useId();
  const inputId = useId();
  const [title, setTitle] = useState(currentTitle);

  useEffect(() => {
    if (!open) return;
    setTitle(currentTitle);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, currentTitle, onClose, busy]);

  if (!open) return null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const next = title.trim();
    if (!next || busy) return;
    await onSave(next);
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
        className="org-dialog docs-rename-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="org-dialog-head">
          <div>
            <h2 id={titleId}>Rename document</h2>
            <p className="lead org-dialog-lead">Updates the display name in this folder.</p>
          </div>
          <IconButton label="Close" disabled={busy} onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </IconButton>
        </header>
        <form className="org-dialog-form form-compact" onSubmit={onSubmit}>
          <div className="org-dialog-body">
            <div className="field field-full">
              <label htmlFor={inputId}>Title</label>
              <input
                id={inputId}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                required
                autoFocus
                disabled={busy}
              />
            </div>
          </div>
          <div className="org-dialog-foot">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={busy || !title.trim() || title.trim() === currentTitle}
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
