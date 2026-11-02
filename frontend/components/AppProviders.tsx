"use client";

import type { ReactElement, ReactNode } from "react";
import { ConfirmProvider } from "../context/ConfirmContext";
import { ToastProvider } from "../context/ToastContext";
import { ToastViewport } from "./ToastViewport";

export const AppProviders = ({ children }: { children: ReactNode }): ReactElement => {
  return (
    <ToastProvider>
      <ConfirmProvider>
        {children}
        <ToastViewport />
      </ConfirmProvider>
    </ToastProvider>
  );
};
