"use client";

import type { ReactNode } from "react";
import { Button } from "./Button";

/**
 * The four states every surface in Delter AI must handle: loading, empty, error
 * and success. These components exist so no screen invents its own version, and
 * so an error always arrives with the server's real message plus a retry action
 * where retrying makes sense.
 */

/* ------------------------------------------------------------------ Empty --- */

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg border border-dashed text-center ${
        compact ? "px-4 py-6" : "px-6 py-12"
      }`}
      style={{ borderColor: "var(--border)" }}
    >
      {icon ? (
        <div
          className={`mb-3 flex items-center justify-center rounded-lg border text-fg-muted ${compact ? "h-9 w-9" : "h-11 w-11"}`}
          style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}
          aria-hidden
        >
          {icon}
        </div>
      ) : null}
      <h3 className={`font-semibold text-fg ${compact ? "text-[13.5px]" : "text-[15px]"}`}>{title}</h3>
      {description ? (
        <p className={`mt-1.5 max-w-md text-fg-muted ${compact ? "text-[12.5px]" : "text-[13px]"} leading-relaxed`}>
          {description}
        </p>
      ) : null}
      {action || secondaryAction ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{action}{secondaryAction}</div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Error --- */

export function ErrorState({
  title = "That did not work",
  message,
  onRetry,
  retryLabel = "Try again",
  retrying = false,
  children,
  compact = false,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={`rounded-lg border ${compact ? "p-3" : "p-4"}`}
      style={{ borderColor: "color-mix(in srgb, var(--danger) 38%, var(--border))", background: "var(--danger-soft)" }}
    >
      <div className="flex items-start gap-2.5">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="var(--danger)"
          strokeWidth="1.6"
          strokeLinecap="round"
          className="mt-[1px] shrink-0"
          aria-hidden
        >
          <circle cx="8" cy="8" r="6.25" />
          <path d="M8 5v3.5" />
          <path d="M8 10.75h.01" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold" style={{ color: "var(--danger)" }}>
            {title}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-fg-secondary break-words">{message}</p>
          {children}
          {onRetry ? (
            <div className="mt-3">
              <Button size="sm" variant="secondary" onClick={onRetry} loading={retrying} loadingLabel={retryLabel}>
                {retryLabel}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Skeleton --- */

export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`animate-pulse rounded ${className}`}
      style={{ background: "var(--bg-muted)", ...style }}
      aria-hidden
    />
  );
}

export function LoadingState({ label = "Loading…", className = "" }: { label?: string; className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-2.5 py-10 text-[13px] text-fg-muted ${className}`} role="status" aria-live="polite">
      <svg className="h-4 w-4 animate-spin" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.22" strokeWidth="2" />
        <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {label}
    </div>
  );
}

/** Row placeholders shaped like the list they stand in for. */
export function SkeletonRows({ rows = 4, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-lg border p-3"
          style={{ borderColor: "var(--border)" }}
        >
          <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3" style={{ width: `${45 + ((index * 13) % 40)}%` }} />
            <Skeleton className="h-2.5" style={{ width: `${25 + ((index * 17) % 35)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Badge --- */

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

const BADGE_TONES: Record<BadgeTone, { fg: string; bg: string; border: string }> = {
  neutral: { fg: "var(--text-secondary)", bg: "var(--bg-muted)", border: "var(--border)" },
  accent: { fg: "var(--accent-text)", bg: "var(--accent-soft)", border: "color-mix(in srgb, var(--accent) 26%, var(--border))" },
  success: { fg: "var(--success)", bg: "var(--success-soft)", border: "color-mix(in srgb, var(--success) 26%, var(--border))" },
  warning: { fg: "var(--warning)", bg: "var(--warning-soft)", border: "color-mix(in srgb, var(--warning) 30%, var(--border))" },
  danger: { fg: "var(--danger)", bg: "var(--danger-soft)", border: "color-mix(in srgb, var(--danger) 28%, var(--border))" },
};

export function Badge({
  tone = "neutral",
  children,
  title,
  className = "",
  dot = false,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  title?: string;
  className?: string;
  dot?: boolean;
}) {
  const colors = BADGE_TONES[tone];
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-[1px] text-[11px] font-medium leading-[18px] whitespace-nowrap ${className}`}
      style={{ color: colors.fg, background: colors.bg, borderColor: colors.border }}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full" style={{ background: colors.fg }} aria-hidden /> : null}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------ NotBuiltYet --- */

/**
 * The honest placeholder for roadmap tools.
 *
 * Not a disabled button pretending to work and not a fake screen: it states what
 * the tool will do, which roadmap stage delivers it, and what the user can do
 * today instead.
 */
export function NotBuiltYet({
  title,
  stage,
  description,
  capabilities,
  alternative,
}: {
  title: string;
  stage: number;
  description: string;
  capabilities: string[];
  alternative?: { label: string; href: string; note: string };
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <div className="rounded-xl border p-5 sm:p-7" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-caps">Roadmap step {stage}</span>
          <span className="h-1 w-1 rounded-full bg-fg-faint" aria-hidden />
          <span className="text-[11.5px] font-medium" style={{ color: "var(--warning)" }}>
            Not built yet
          </span>
        </div>

        <h1 className="mt-2.5 text-[22px] font-semibold tracking-[-0.02em] text-fg sm:text-[26px]">{title}</h1>
        <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-fg-secondary">{description}</p>

        <div className="mt-5 rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
          <p className="label-caps mb-2.5">Planned capabilities</p>
          <ul className="space-y-1.5">
            {capabilities.map((capability) => (
              <li key={capability} className="flex items-start gap-2 text-[13px] text-fg-secondary">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--text-faint)" strokeWidth="1.6" className="mt-[3px] shrink-0" aria-hidden>
                  <circle cx="8" cy="8" r="3" />
                </svg>
                {capability}
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-4 text-[12.5px] leading-relaxed text-fg-muted">
          Delter AI does not show a fake version of this tool. The navigation entry is marked as not available so nothing
          here looks like it works when it does not.
        </p>

        {alternative ? (
          <div
            className="mt-4 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
            style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}
          >
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-fg">{alternative.label}</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-muted">{alternative.note}</p>
            </div>
            <a
              href={alternative.href}
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-md px-3.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "var(--accent)" }}
            >
              Open it
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
