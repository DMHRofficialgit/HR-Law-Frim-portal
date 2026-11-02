"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

export type ToastTone = "success" | "error" | "info";

export type ToastItem = {
  id: string;
  tone: ToastTone;
  message: string;
  durationMs: number;
};

type ShowToastInput = {
  tone?: ToastTone;
  message: string;
  durationMs?: number;
};

type ToastContextValue = {
  toasts: ToastItem[];
  showToast: (input: ShowToastInput | string) => string;
  success: (message: string, durationMs?: number) => string;
  error: (message: string, durationMs?: number) => string;
  info: (message: string, durationMs?: number) => string;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 4200,
  info: 4200,
  error: 7000,
};

let toastSeq = 0;

export const ToastProvider = ({ children }: { children: ReactNode }): ReactElement => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (input: ShowToastInput | string) => {
      const payload = typeof input === "string" ? { message: input } : input;
      const tone = payload.tone || "info";
      const id = `toast-${Date.now()}-${++toastSeq}`;
      const item: ToastItem = {
        id,
        tone,
        message: payload.message.trim(),
        durationMs: payload.durationMs ?? DEFAULT_DURATION[tone],
      };
      if (!item.message) return id;
      setToasts((prev) => [...prev.slice(-4), item]);
      window.setTimeout(() => dismissToast(id), item.durationMs);
      return id;
    },
    [dismissToast]
  );

  const success = useCallback(
    (message: string, durationMs?: number) =>
      showToast({ tone: "success", message, durationMs }),
    [showToast]
  );
  const error = useCallback(
    (message: string, durationMs?: number) =>
      showToast({ tone: "error", message, durationMs }),
    [showToast]
  );
  const info = useCallback(
    (message: string, durationMs?: number) =>
      showToast({ tone: "info", message, durationMs }),
    [showToast]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      showToast,
      success,
      error,
      info,
      dismissToast,
    }),
    [toasts, showToast, success, error, info, dismissToast]
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
};

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
};
