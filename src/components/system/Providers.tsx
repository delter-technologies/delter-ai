"use client";

import type { ReactNode } from "react";
import { ThemeProvider, type Theme } from "./ThemeProvider";
import { ToastProvider } from "./ToastProvider";
import { ConfirmProvider } from "./ConfirmProvider";

/**
 * Client-side providers, nested so that a confirm dialog can raise a toast and
 * both can read the theme.
 */
export function Providers({
  children,
  initialTheme,
}: {
  children: ReactNode;
  initialTheme?: Theme | null;
}) {
  return (
    <ThemeProvider initialTheme={initialTheme}>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
