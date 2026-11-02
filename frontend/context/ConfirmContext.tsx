"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

export type ConfirmTone = "default" | "danger";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type ConfirmRequest = ConfirmOptions & {
  id: string;
  resolve: (ok: boolean) => void;
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export const ConfirmProvider = ({ children }: { children: ReactNode }): ReactElement => {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const titleId = useId();
  const descId = useId();
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback((ok: boolean) => {
    setRequest((current) => {
      if (current) current.resolve(ok);
      return null;
    });
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setRequest((prev) => {
        if (prev) prev.resolve(false);
        return {
          id: `confirm-${Date.now()}`,
          title: options.title.trim() || "Confirm",
          description: options.description?.trim() || undefined,
          confirmLabel: options.confirmLabel || "Confirm",
          cancelLabel: options.cancelLabel || "Cancel",
          tone: options.tone || "default",
          resolve,
        };
      });
    });
  }, []);

  useEffect(() => {
    if (!request) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => confirmBtnRef.current?.focus(), 0);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [request, close]);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {request ? (
        <div
          className="org-dialog-root confirm-dialog-root"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close(false);
          }}
        >
          <button
            type="button"
            className="org-dialog-backdrop"
            aria-label="Dismiss"
            onClick={() => close(false)}
          />
          <div
            className="org-dialog confirm-dialog-panel"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={request.description ? descId : undefined}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="confirm-dialog-body">
              <h2 id={titleId} className="confirm-dialog-title">
                {request.title}
              </h2>
              {request.description ? (
                <p id={descId} className="lead confirm-dialog-desc">
                  {request.description}
                </p>
              ) : null}
            </div>
            <div className="confirm-dialog-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => close(false)}
              >
                {request.cancelLabel}
              </button>
              <button
                ref={confirmBtnRef}
                type="button"
                className={`btn btn-sm ${
                  request.tone === "danger" ? "btn-danger" : "btn-primary"
                }`}
                onClick={() => close(true)}
              >
                {request.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = (): ConfirmContextValue => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return ctx;
};
