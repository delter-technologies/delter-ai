"use client";

import { useState } from "react";
import { Badge, EmptyState } from "@/components/ui/States";
import { IconChart } from "@/components/ui/Icons";
import { useToast } from "@/components/system/ToastProvider";
import { api, errorMessage } from "@/lib/client/api";
import { formatBytes, formatNumber } from "@/lib/client/format";
import { Note, Section, Stat } from "../parts";
import type { SettingsData, SettingsUsage } from "../SettingsView";

/**
 * Usage.
 *
 * Every number is aggregated from UsageEvent rows written when work actually
 * happened, plus the bytes currently on disk. Nothing is estimated and nothing
 * is projected: if you have not used a feature, it reads zero. Billing is
 * reported as inactive rather than hidden, because that is the truth today.
 */

const RANGES = [7, 30, 90];

export function UsageTab({
  usage,
  onUsageChanged,
  limits,
}: {
  usage: SettingsUsage;
  onUsageChanged: (usage: SettingsUsage) => void;
  limits: SettingsData["limits"];
}) {
  const toast = useToast();
  const [days, setDays] = useState(usage.days);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(range: number) {
    setDays(range);
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<SettingsUsage>(`/api/user/usage?days=${range}`);
      onUsageChanged(data);
    } catch (caught) {
      const message = errorMessage(caught, "Delter AI could not load your usage.");
      setError(message);
      toast.error("Could not load usage", message);
    } finally {
      setLoading(false);
    }
  }

  const peak = Math.max(1, ...usage.ai.byDay.map((day) => day.requests));
  const successRate = usage.ai.requests
    ? Math.round(((usage.ai.requests - usage.ai.failedRequests) / usage.ai.requests) * 100)
    : null;

  return (
    <div className="space-y-5">
      <Section
        title={`Last ${usage.days} days`}
        description="Recorded per request and per upload as they happened. Switch the range to re-aggregate from the same events."
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-bg-subtle p-1" role="group" aria-label="Usage range">
              {RANGES.map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => void load(range)}
                  disabled={loading}
                  aria-pressed={days === range}
                  className={`rounded-md px-3 py-1 text-[12.5px] transition-colors disabled:opacity-60 ${
                    days === range ? "bg-surface font-medium text-fg shadow-sm" : "text-fg-muted hover:text-fg"
                  }`}
                >
                  {range} days
                </button>
              ))}
            </div>
            {loading ? <span className="text-[12px] text-fg-muted">Re-aggregating…</span> : null}
          </div>
        }
      >
        {error ? (
          <p className="mb-3 text-[12.5px]" style={{ color: "var(--danger)" }} role="alert">
            {error}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="AI requests"
            value={formatNumber(usage.ai.requests)}
            hint={
              successRate === null
                ? "none yet"
                : `${successRate}% completed · ${formatNumber(usage.ai.failedRequests)} failed`
            }
          />
          <Stat label="Tokens" value={formatNumber(usage.ai.totalTokens)} hint={`${formatNumber(usage.ai.inputTokens)} in · ${formatNumber(usage.ai.outputTokens)} out`} />
          <Stat label="Uploads" value={formatNumber(usage.storage.uploads)} hint={`${formatBytes(usage.storage.bytesOnDisk)} on disk`} />
          <Stat
            label="Stored code"
            value={formatNumber(usage.storage.codeFileCount)}
            hint={`${formatNumber(usage.storage.fileCount)} uploaded file${usage.storage.fileCount === 1 ? "" : "s"}`}
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Stat label="Projects" value={formatNumber(usage.workspace.projectCount)} />
          <Stat label="Conversations" value={formatNumber(usage.workspace.conversationCount)} />
        </div>
      </Section>

      <Section title="Requests per day" description="Each bar is one day of recorded AI requests in this range.">
        {usage.ai.byDay.length === 0 ? (
          <EmptyState
            icon={<IconChart className="h-6 w-6" />}
            title="No AI requests in this range"
            description="Send a message in Chat or Code Studio and the request is recorded here with its real token counts."
            compact
          />
        ) : (
          <ul className="m-0 flex h-40 items-end gap-1 p-0">
            {usage.ai.byDay.map((day) => (
              <li key={day.date} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] text-fg-faint opacity-0 transition-opacity group-hover:opacity-100">
                  {day.requests}
                </span>
                <span
                  className="w-full rounded-t bg-accent"
                  style={{ height: `${Math.max(4, (day.requests / peak) * 100)}%` }}
                  title={`${day.date}: ${day.requests} request${day.requests === 1 ? "" : "s"}, ${formatNumber(day.totalTokens)} tokens`}
                />
                <span className="truncate text-[10px] text-fg-faint">{day.date.slice(5)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="By model" description="Which model actually answered, including fallbacks.">
        {usage.ai.byModel.length === 0 ? (
          <p className="text-[12.5px] text-fg-muted">No model has answered a request in this range yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-border text-[11.5px] uppercase tracking-wide text-fg-muted">
                  <th className="py-2 pr-3 font-medium">Model</th>
                  <th className="py-2 pr-3 font-medium">Provider</th>
                  <th className="py-2 pr-3 text-right font-medium">Requests</th>
                  <th className="py-2 text-right font-medium">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {usage.ai.byModel.map((row) => (
                  <tr key={row.model} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 font-mono text-[12px]">{row.model}</td>
                    <td className="py-2 pr-3 text-fg-secondary">{row.provider ?? "unknown"}</td>
                    <td className="py-2 pr-3 text-right">{formatNumber(row.requests)}</td>
                    <td className="py-2 text-right">{formatNumber(row.totalTokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Storage and limits" description="What this server holds for you, and the real limits it enforces.">
        <dl className="m-0 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-bg-subtle px-3 py-2.5">
            <dt className="text-[11.5px] font-medium text-fg-muted">Uploaded files on disk</dt>
            <dd className="m-0 mt-0.5 text-[15px] font-semibold">{formatBytes(usage.storage.bytesOnDisk)}</dd>
          </div>
          <div className="rounded-lg border border-border bg-bg-subtle px-3 py-2.5">
            <dt className="text-[11.5px] font-medium text-fg-muted">Maximum upload size</dt>
            <dd className="m-0 mt-0.5 text-[15px] font-semibold">{limits.maxUploadMb} MB per file</dd>
          </div>
        </dl>
        <div className="mt-3">
          <Note>
            Code Studio files are stored as text rows in the database rather than on disk, so they are counted
            separately ({formatNumber(usage.storage.codeFileCount)} files) and do not add to the disk figure above.
          </Note>
        </div>
      </Section>

      <Section title="Billing" description="Roadmap step 21.">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={usage.billing.enabled ? "success" : "neutral"} dot>
            {usage.billing.enabled ? "active" : "not active"}
          </Badge>
        </div>
        <div className="mt-3">
          <Note tone="warning">{usage.billing.note}</Note>
        </div>
        <p className="mt-2 text-[12px] text-fg-muted">
          Image generations recorded: {formatNumber(usage.images.generations)}. Image Studio is roadmap step 7 and is
          not built yet, so this stays at zero rather than showing a placeholder number.
        </p>
      </Section>
    </div>
  );
}
