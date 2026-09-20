"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconInfo, IconTerminal } from "@/components/ui/Icons";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/system/ToastProvider";
import type { ExplorerFile } from "./FileExplorer";

/**
 * The terminal panel — and why it is not a shell.
 *
 * Delter AI stores project files in a database. There is no machine behind this
 * panel with Node, Python or a package manager installed, so a prompt that
 * accepted commands would be theatre: it would either do nothing or invent
 * output. Instead this panel shows the real activity log of what Code Studio
 * actually did — saves, applied AI edits, preview reloads, server errors — and
 * offers a real export: a shell script that recreates the project's files on a
 * machine you control, built from the stored contents.
 */

export type TerminalEntry = {
  id: string;
  at: number;
  tone: "info" | "success" | "warning" | "danger";
  label: string;
  message: string;
};

const TONE_COLOUR: Record<TerminalEntry["tone"], string> = {
  info: "var(--text-muted)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

export function TerminalPanel({
  entries,
  files,
  projectName,
  onClear,
}: {
  entries: TerminalEntry[];
  files: ExplorerFile[];
  projectName: string;
  onClear: () => void;
}) {
  const toast = useToast();
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scrollerRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [entries.length]);

  /** A POSIX script that writes every stored file — real contents, real paths. */
  const script = useMemo(() => buildScript(projectName, files), [projectName, files]);

  async function copyScript() {
    if (!files.length) {
      toast.info("Nothing to export", "This project has no files yet.");
      return;
    }
    try {
      await navigator.clipboard.writeText(script);
      toast.success("Script copied", `${files.length} file${files.length === 1 ? "" : "s"} as a shell script.`);
    } catch {
      toast.error(
        "Your browser blocked the clipboard",
        "Select the script text below and copy it manually — nothing was lost.",
      );
      setShowScript(true);
    }
  }

  const [showScript, setShowScript] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-subtle">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <IconTerminal className="h-3.5 w-3.5 text-fg-muted" />
          <h3 className="text-[12.5px] font-semibold">Activity</h3>
          <span className="rounded-full border border-border px-1.5 py-px text-[10px] uppercase tracking-wide text-fg-faint">
            no shell
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setShowScript((v) => !v)}>
            {showScript ? "Hide script" : "Export script"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear} disabled={!entries.length}>
            Clear
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 border-b border-border bg-bg px-3 py-2">
        <IconInfo className="mt-[2px] h-3.5 w-3.5 shrink-0 text-fg-faint" />
        <p className="text-[11.5px] leading-relaxed text-fg-muted">
          Code Studio does not run commands. Your files are stored in Delter AI's database, not on a machine with Node
          or Python installed, so a command prompt here would only pretend to work. This log shows what really
          happened; “Export script” gives you a shell script that recreates these files on your own machine.
        </p>
      </div>

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[12px] leading-relaxed">
        {entries.length === 0 ? (
          <p className="text-fg-faint">
            Nothing has happened yet. Save a file, apply an assistant change or reload the preview and it will appear
            here with a timestamp.
          </p>
        ) : (
          <ul className="space-y-1">
            {entries.map((entry) => (
              <li key={entry.id} className="flex gap-2">
                <span className="shrink-0 text-fg-faint">{formatClock(entry.at)}</span>
                <span className="shrink-0 font-semibold" style={{ color: TONE_COLOUR[entry.tone] }}>
                  {entry.label}
                </span>
                <span className="min-w-0 break-words text-fg-secondary">{entry.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showScript && (
        <div className="border-t border-border bg-bg p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11.5px] text-fg-muted">
              <code className="font-mono">recreate-{slug(projectName)}.sh</code> — run it in an empty folder on your
              machine.
            </p>
            <Button size="sm" onClick={() => void copyScript()}>
              Copy script
            </Button>
          </div>
          <pre className="max-h-56 overflow-auto rounded-md border border-border bg-bg-subtle p-2 font-mono text-[11.5px] leading-relaxed text-fg-secondary">
            {files.length ? script : "# This project has no files yet."}
          </pre>
        </div>
      )}
    </div>
  );
}

function formatClock(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
}

function buildScript(projectName: string, files: ExplorerFile[]): string {
  const lines = [
    "#!/usr/bin/env bash",
    `# Recreates the Code Studio project “${projectName}” on this machine.`,
    `# Generated by Delter AI on ${new Date().toISOString()}`,
    "set -euo pipefail",
    "",
  ];

  for (const file of files) {
    const content = file.content ?? "";
    // A heredoc quoted with 'EOF' passes content through literally, so nothing
    // inside the file is expanded by the shell. If the content itself contains
    // the delimiter, use a numbered variant.
    let delimiter = "DETER_FILE_EOF";
    let index = 1;
    while (content.includes(delimiter)) {
      delimiter = `DETER_FILE_EOF_${(index += 1)}`;
    }
    const dir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "";
    if (dir) lines.push(`mkdir -p ${shellQuote(dir)}`);
    lines.push(`cat > ${shellQuote(file.path)} <<'${delimiter}'`);
    lines.push(content);
    lines.push(delimiter);
    lines.push("");
  }

  lines.push(`echo "Wrote ${files.length} file${files.length === 1 ? "" : "s"} from ${slug(projectName)}."`);
  return lines.join("\n");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
