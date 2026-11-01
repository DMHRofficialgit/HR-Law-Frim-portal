"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import type { ReactElement } from "react";
import { useToast, type ToastTone } from "../context/ToastContext";

const ICONS: Record<ToastTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export const ToastViewport = (): ReactElement => {
  const { toasts, dismissToast } = useToast();

  return (
    <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.tone];
        return (
          <div
            key={toast.id}
            className={`toast-item toast-${toast.tone}`}
            role={toast.tone === "error" ? "alert" : "status"}
          >
            <Icon className="toast-icon" size={16} strokeWidth={2} aria-hidden />
            <p className="toast-message">{toast.message}</p>
            <button
              type="button"
              className="toast-dismiss"
              aria-label="Dismiss notification"
              onClick={() => dismissToast(toast.id)}
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
