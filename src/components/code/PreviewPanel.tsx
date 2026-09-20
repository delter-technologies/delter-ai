"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconAlert, IconExternal, IconEye, IconRefresh } from "@/components/ui/Icons";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";
import type { PreviewStatus } from "@/lib/code/preview-status";

/**
 * The preview pane.
 *
 * The iframe points at `/api/projects/:id/preview`, an authenticated route that
 * renders the project's saved files. The frame is sandboxed without
 * `allow-same-origin`, so project JavaScript cannot read Delter AI's cookies,
 * storage or DOM.
 *
 * It renders HTML, CSS, JavaScript and Markdown only. TypeScript, JSX and Python
 * need a real build runtime, and the pane says so instead of showing a blank
 * frame or pretending to compile.
 */

/** The status the preview route computes, as Code Studio receives it. */
export type PreviewStatusPayload = PreviewStatus;

const VIEWPORTS = [
  { id: "responsive", label: "Full", width: null as number | null },
  { id: "desktop", label: "Desktop", width: 1280 },
  { id: "tablet", label: "Tablet", width: 834 },
  { id: "mobile", label: "Phone", width: 390 },
];

export function PreviewPanel({
  projectId,
  status,
  fileCount,
  entryCandidates,
  refreshKey,
}: {
  projectId: string;
  status: PreviewStatusPayload | null;
  fileCount: number;
  /** Files the preview route could start from (HTML and Markdown). */
  entryCandidates: string[];
  /** Bumped by the parent after a save or an applied AI edit. */
  refreshKey: number;
}) {
  const [viewport, setViewport] = useState(VIEWPORTS[0]);
  const [loading, setLoading] = useState(false);
  const [entryOverride, setEntryOverride] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const src = useMemo(() => {
    if (!status || status.previewable !== true) return null;
    const params = new URLSearchParams();
    const entry = entryOverride ?? status.entryPath;
    if (entry) params.set("entry", entry);
    // A nonce forces the iframe to re-request after saves and applied edits.
    params.set("r", `${refreshKey}-${reloadNonce}`);
    return `/api/projects/${encodeURIComponent(projectId)}/preview?${params.toString()}`;
  }, [status, entryOverride, projectId, refreshKey, reloadNonce]);

  const reload = useCallback(() => {
    setLoading(true);
    setReloadNonce((nonce) => nonce + 1);
  }, []);

  useEffect(() => {
    if (src) setLoading(true);
  }, [src]);

  function openInNewTab() {
    if (!src) return;
    window.open(src, "_blank", "noopener,noreferrer");
  }

  if (!status) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={<IconEye className="h-6 w-6" />}
          title="Checking preview support…"
          description="Code Studio looks at the files stored in this project to see what can be rendered."
          compact
        />
      </div>
    );
  }

  if (status.previewable !== true) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={<IconAlert className="h-6 w-6" />}
          title="This project cannot be previewed yet"
          description={
            <span className="block max-w-md text-[13px] leading-relaxed">
              {status.reason}
              {status.hint ? <span className="mt-2 block text-fg-muted">{status.hint}</span> : null}
              <span className="mt-3 block text-[12px] text-fg-faint">
                {fileCount} file{fileCount === 1 ? "" : "s"} in this project. Code Studio renders HTML, CSS, JavaScript
                and Markdown straight from your saved files — it does not compile TypeScript, JSX or Python, because
                that needs a build runtime Delter AI does not run here.
              </span>
            </span>
          }
          compact
        />
      </div>
    );
  }

  const entryPath = entryOverride ?? status.entryPath;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-bg-subtle px-3 py-2">
        <div className="flex items-center gap-1 rounded-md border border-border bg-bg p-0.5">
          {VIEWPORTS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setViewport(option)}
              className={`rounded-[5px] px-2 py-1 text-[11.5px] transition-colors ${
                viewport.id === option.id ? "bg-bg-muted text-fg" : "text-fg-muted hover:text-fg"
              }`}
              aria-pressed={viewport.id === option.id}
            >
              {option.label}
            </button>
          ))}
        </div>

        {entryCandidates.length > 1 ? (
          <label className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-[11px] font-medium text-fg-muted">Entry</span>
            <select
              value={entryPath ?? ""}
              onChange={(event) => setEntryOverride(event.target.value || null)}
              className="min-w-0 max-w-[220px] rounded-md border border-border bg-bg px-2 py-1 font-mono text-[11.5px] text-fg outline-none focus:border-accent"
              aria-label="Choose which file to render"
            >
              {entryCandidates.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {candidate}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="min-w-0 truncate font-mono text-[11.5px] text-fg-muted" title={entryPath ?? undefined}>
            {entryPath}
            {status.mode === "markdown" ? " · rendered as a document" : ""}
          </p>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={reload} icon={<IconRefresh className="h-3.5 w-3.5" />}>
            Reload
          </Button>
          <Button size="sm" variant="ghost" onClick={openInNewTab} icon={<IconExternal className="h-3.5 w-3.5" />}>
            Open
          </Button>
        </div>
      </div>

      {status.note ? (
        <p className="border-b border-border bg-bg-subtle px-3 py-1.5 text-[11.5px] text-fg-muted">{status.note}</p>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-auto bg-bg-muted p-0 sm:p-3">
        {loading && (
          <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden">
            <div className="progress-slide h-full w-1/3 bg-accent" />
          </div>
        )}
        <div
          className="mx-auto h-full overflow-hidden rounded-lg border border-border bg-white transition-[max-width] duration-200"
          style={{ maxWidth: viewport.width ? `${viewport.width}px` : "100%" }}
        >
          <iframe
            key={src ?? "none"}
            src={src ?? undefined}
            title={`Preview of ${entryPath ?? "the project"}`}
            sandbox="allow-scripts allow-forms allow-modals allow-popups"
            onLoad={() => setLoading(false)}
            className="h-full min-h-[320px] w-full border-0 bg-white"
          />
        </div>
      </div>
    </div>
  );
}
