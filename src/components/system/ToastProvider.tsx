"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export type ToastTone = "info" | "success" | "warning" | "error";

export type Toast = {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  /** Label + handler for an inline action, e.g. "Retry" or "Undo". */
  action?: { label: string; onClick: () => void };
  duration: number;
};

type ToastInput = Omit<Toast, "id" | "duration"> & { duration?: number };

type ToastContextValue = {
  toasts: Toast[];
  push: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
  info: (title: string, description?: string) => string;
  success: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DURATION: Record<ToastTone, number> = {
  info: 4000,
  success: 3200,
  warning: 6000,
  error: 9000,
};

/**
 * Toasts.
 *
 * Every major action in Delter AI reports its outcome through here, which is how
 * the "no fake buttons, no silent failures" rule is enforced in practice: an
 * action either shows a success toast with real data or an error toast with the
 * server's actual message and, where it helps, a retry action.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const tone = input.tone ?? "info";
      const duration = input.duration ?? DURATION[tone];

      setToasts((current) => [...current.slice(-3), { ...input, tone, id, duration }]);

      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      push,
      dismiss,
      info: (title, description) => push({ tone: "info", title, description }),
      success: (title, description) => push({ tone: "success", title, description }),
      warning: (title, description) => push({ tone: "warning", title, description }),
      error: (title, description) => push({ tone: "error", title, description, duration: 0 }),
    }),
    [toasts, push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>.");
  return context;
}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-3 sm:items-end sm:p-4"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

const TONE_STYLES: Record<ToastTone, { bar: string; icon: ReactNode; label: string }> = {
  info: { bar: "var(--accent)", icon: <IconInfo />, label: "Info" },
  success: { bar: "var(--success)", icon: <IconCheck />, label: "Success" },
  warning: { bar: "var(--warning)", icon: <IconAlert />, label: "Warning" },
  error: { bar: "var(--danger)", icon: <IconAlert />, label: "Error" },
};

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const tone = TONE_STYLES[toast.tone];

  return (
    <div
      role="status"
      aria-live={toast.tone === "error" ? "assertive" : "polite"}
      className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg border bg-surface-raised shadow-lg"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex gap-3 p-3">
        <span className="mt-0.5 shrink-0" style={{ color: tone.bar }} aria-hidden>
          {tone.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-snug text-fg">{toast.title}</p>
          {toast.description ? (
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-secondary break-words">{toast.description}</p>
          ) : null}
          {toast.action ? (
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick();
                onDismiss(toast.id);
              }}
              className="mt-2 rounded-md border px-2.5 py-1 text-[12px] font-medium text-fg transition-colors hover:bg-bg-muted"
              style={{ borderColor: "var(--border)" }}
            >
              {toast.action.label}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label={`Dismiss ${tone.label.toLowerCase()} notification`}
          className="-mr-1 -mt-1 h-6 w-6 shrink-0 rounded text-fg-faint transition-colors hover:bg-bg-muted hover:text-fg"
        >
          <IconClose />
        </button>
      </div>
      <div className="h-0.5 w-full" style={{ background: tone.bar, opacity: 0.55 }} />
    </div>
  );
}

/* --- icons: 16px, 1.5 stroke, currentColor -------------------------------- */

function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.25 4.75 6 12 2.75 8.75" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.75 14.5 13h-13L8 1.75Z" />
      <path d="M8 6.25v3" />
      <path d="M8 11.25h.01" />
    </svg>
  );
}

function IconInfo() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.25v4" />
      <path d="M8 4.75h.01" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
    </svg>
  );
}
