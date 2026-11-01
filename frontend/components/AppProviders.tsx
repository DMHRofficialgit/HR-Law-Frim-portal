"use client";

import type { ReactElement, ReactNode } from "react";
import { ToastProvider } from "../context/ToastContext";
import { ToastViewport } from "./ToastViewport";

export const AppProviders = ({ children }: { children: ReactNode }): ReactElement => {
  return (
    <ToastProvider>
      {children}
      <ToastViewport />
    </ToastProvider>
  );
};
