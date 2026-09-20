"use client";

import type { ReactNode } from "react";
import { formatBytes, formatDateTime, formatNumber, relativeTime } from "@/lib/client/format";

/**
 * Shared layout pieces for the Settings screen: a section card, a stat tile and
 * a definition row. Kept in one place so every tab reads the same way.
 */

export function Section({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface">
      <header className="border-b border-border px-4 py-3 sm:px-5">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        {description ? <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-fg-muted">{description}</p> : null}
      </header>
      <div className="px-4 py-4 sm:px-5">{children}</div>
      {footer ? <div className="border-t border-border px-4 py-3 sm:px-5">{footer}</div> : null}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg-subtle px-3 py-2.5">
      <p className="text-[11.5px] font-medium text-fg-muted">{label}</p>
      <p className="mt-0.5 text-[19px] font-semibold leading-tight">{value}</p>
      {hint ? <p className="mt-0.5 text-[11.5px] text-fg-faint">{hint}</p> : null}
    </div>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border py-2.5 last:border-0 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="w-52 shrink-0 text-[12.5px] font-medium text-fg-secondary">{label}</dt>
      <dd className="min-w-0 flex-1 text-[12.5px] text-fg">{children}</dd>
    </div>
  );
}

export function Note({ tone = "info", children }: { tone?: "info" | "warning"; children: ReactNode }) {
  return (
    <p
      className="rounded-md border px-3 py-2 text-[12px] leading-relaxed"
      style={{
        borderColor: tone === "warning" ? "color-mix(in srgb, var(--warning) 40%, transparent)" : "var(--border)",
        background: tone === "warning" ? "var(--warning-soft)" : "var(--bg-subtle)",
        color: "var(--text-secondary)",
      }}
    >
      {children}
    </p>
  );
}

export { formatBytes, formatDateTime, formatNumber, relativeTime };
