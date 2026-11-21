"use client";

import {
  FormEvent,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
} from "react";

export type OrgDeleteDialogMode = "single" | "bulk";

type OrgDeleteDialogProps = {
  open: boolean;
  mode: OrgDeleteDialogMode;
  /** Organisation display name (single) or count label (bulk). */
  titleName: string;
  /** Exact string the admin must type (org name or DELETE). */
  expectedConfirm: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (typed: string) => void;
};

export const OrgDeleteDialog = ({
  open,
  mode,
  titleName,
  expectedConfirm,
  busy = false,
  onClose,
  onConfirm,
}: OrgDeleteDialogProps): ReactElement | null => {
  const titleId = useId();
  const descId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!open) return;
    setTyped("");
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  const matches = typed.trim() === expectedConfirm;
  const label =
    mode === "bulk"
      ? `Type ${expectedConfirm} to permanently delete ${titleName}`
      : `Type the organisation name to confirm`;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!matches || busy) return;
    onConfirm(typed.trim());
  }

  return (
    <div
      className="org-dialog-root confirm-dialog-root"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <button
        type="button"
        className="org-dialog-backdrop"
        aria-label="Dismiss"
        disabled={busy}
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <form
        className="org-dialog confirm-dialog-panel form-compact"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="confirm-dialog-body">
          <h2 id={titleId} className="confirm-dialog-title">
            Delete permanently?
          </h2>
          <p id={descId} className="lead confirm-dialog-desc">
            {mode === "bulk" ? (
              <>
                This permanently removes {titleName} now (before the 30-day
                auto-purge), including client logins, documents, cases, and
                signatures. This cannot be undone.
              </>
            ) : (
              <>
                This permanently removes <strong>{titleName}</strong> now
                (before the 30-day auto-purge), including client logins,
                documents, cases, and signatures. This cannot be undone.
              </>
            )}
          </p>
          <label className="field">
            <span className="field-label">{label}</span>
            <input
              ref={inputRef}
              type="text"
              className="input"
              autoComplete="off"
              spellCheck={false}
              value={typed}
              disabled={busy}
              placeholder={expectedConfirm}
              aria-label={label}
              onChange={(e) => setTyped(e.target.value)}
            />
          </label>
        </div>
        <div className="confirm-dialog-actions">
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
            className="btn btn-danger btn-sm"
            disabled={!matches || busy}
          >
            {busy ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </form>
    </div>
  );
};
