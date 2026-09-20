"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ConfirmTone = "neutral" | "danger";

type ConfirmOptions = {
  title: string;
  /** Plain-language description of what will actually happen. */
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

/**
 * Destructive-action confirmation.
 *
 * Destructive operations (delete project, delete file, revoke sessions, discard
 * unsaved edits) must state what will be lost, not just ask "Are you sure?".
 * Resolves `true`/`false` so callers can await it inline.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { open: boolean }) | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((value: boolean) => {
    setState((current) => (current ? { ...current, open: false } : current));
    resolver.current?.(value);
    resolver.current = null;
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    setState({ ...options, open: true });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  // Escape closes with "cancel" — never with a confirmed destructive action.
  useEffect(() => {
    if (!state?.open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [state?.open, close]);

  useEffect(() => {
    if (state?.open) confirmButtonRef.current?.focus();
  }, [state?.open]);

  const value = useMemo(() => ({ confirm }), [confirm]);
  const tone = state?.tone ?? "neutral";

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {state?.open ? (
        <div className="fixed inset-0 z-[110] flex items-end justify-center p-3 sm:items-center sm:p-4">
          <div
            className="absolute inset-0 bg-black/55"
            onClick={() => close(false)}
            aria-hidden
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-description"
            className="relative w-full max-w-md rounded-xl border bg-surface-raised p-5 shadow-lg"
            style={{ borderColor: "var(--border)" }}
          >
            <h2 id="confirm-title" className="text-[15px] font-semibold text-fg">
              {state.title}
            </h2>
            {state.description ? (
              <div id="confirm-description" className="mt-2 text-[13px] leading-relaxed text-fg-secondary">
                {state.description}
              </div>
            ) : null}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => close(false)}
                className="h-9 rounded-md border px-3.5 text-[13px] font-medium text-fg transition-colors hover:bg-bg-muted"
                style={{ borderColor: "var(--border)" }}
              >
                {state.cancelLabel ?? "Cancel"}
              </button>
              <button
                ref={confirmButtonRef}
                type="button"
                onClick={() => close(true)}
                className="h-9 rounded-md px-3.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: tone === "danger" ? "var(--danger)" : "var(--accent)" }}
              >
                {state.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm must be used inside <ConfirmProvider>.");
  return context;
}
