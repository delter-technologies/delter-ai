/**
 * Display formatting shared by client components.
 *
 * Pure functions only — no `Intl` calls that depend on the rendering clock in a
 * way that could differ between server and client first paint. Anything here is
 * safe to call during render.
 */

/** Compact "3m ago" style time. Falls back to a date once older than a week. */
export function relativeTime(iso: string | Date | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const time = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  if (Number.isNaN(time)) return "";

  const diffSeconds = Math.round((now - time) / 1000);
  const future = diffSeconds < 0;
  const abs = Math.abs(diffSeconds);

  if (abs < 45) return future ? "in a moment" : "just now";

  const units: [number, string, Intl.RelativeTimeFormatUnit][] = [
    [60, "second", "second"],
    [60, "minute", "minute"],
    [24, "hour", "hour"],
    [7, "day", "day"],
  ];

  let value = abs;
  let unit: Intl.RelativeTimeFormatUnit = "second";
  for (const [divisor, , targetUnit] of units) {
    const next = value / divisor;
    if (next < 1) break;
    value = next;
    unit = targetUnit;
    if (unit === "day") break;
  }

  const rounded = Math.round(value);
  if (unit === "day" && rounded > 7) return formatDate(iso);

  const short: Record<string, string> = {
    second: `${rounded}s`,
    minute: `${rounded}m`,
    hour: `${rounded}h`,
    day: `${rounded}d`,
  };
  return future ? `in ${short[unit]}` : `${short[unit]} ago`;
}

/** "12 Mar 2026" — stable across locales, no timezone surprises. */
export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/** "12 Mar 2026, 14:05" */
export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "";
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${formatDate(date)}, ${hh}:${mm}`;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value));
}

export function formatBytes(bytes: number): string {
  if (!bytes || !Number.isFinite(bytes)) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

/** "1.2s" / "840ms" — for showing how long a generation took. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}
