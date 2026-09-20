"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Theme = "system" | "light" | "dark";

type ThemeContextValue = {
  /** What the user chose. */
  theme: Theme;
  /** What is actually applied, after resolving "system". */
  resolved: "light" | "dark";
  setTheme: (theme: Theme) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "delter.theme";

function readSystemPreference(): "light" | "dark" {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function asTheme(value: string | null): Theme | null {
  return value === "light" || value === "dark" || value === "system" ? value : null;
}

function readStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    return asTheme(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * The theme saved on the user's account, published by the workspace layout as a
 * `data-user-theme` attribute on <html>. It is what a signed-in user gets on a
 * device where they have not made a local choice yet.
 */
function readAccountTheme(): Theme | null {
  if (typeof document === "undefined") return null;
  return asTheme(document.documentElement.getAttribute("data-user-theme"));
}

/**
 * Theme state.
 *
 * The choice lives in localStorage (so it survives instantly, without a network
 * round-trip) and is mirrored to the user's account when they are signed in, so
 * it follows them between devices.
 */
export function ThemeProvider({ children, initialTheme }: { children: ReactNode; initialTheme?: Theme | null }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme ?? "system");
  const [systemPreference, setSystemPreference] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Precedence: this device's explicit choice → the account preference → the
    // server-rendered initial value → system.
    setThemeState(readStoredTheme() ?? readAccountTheme() ?? initialTheme ?? "system");
    setSystemPreference(readSystemPreference());

    if (!window.matchMedia) return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setSystemPreference(event.matches ? "dark" : "light");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [initialTheme]);

  const resolved = theme === "system" ? systemPreference : theme;

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;
  }, [resolved, mounted]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing or a full quota — the session still works, it just will
      // not remember the choice.
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(resolved === "dark" ? "light" : "dark");
  }, [resolved, setTheme]);

  const value = useMemo(() => ({ theme, resolved, setTheme, toggle }), [theme, resolved, setTheme, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    // Outside the provider (e.g. a marketing page rendered standalone) fall back
    // to a usable value instead of throwing during render.
    return { theme: "system", resolved: "light", setTheme: () => {}, toggle: () => {} };
  }
  return context;
}
