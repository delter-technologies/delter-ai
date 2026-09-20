"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "@/components/ui/Markdown";
import { Badge } from "@/components/ui/States";
import { Button } from "@/components/ui/Button";
import { IconClose, IconFileCode, IconRefresh, IconSend, IconSparkle, IconStop } from "@/components/ui/Icons";
import { api, errorMessage } from "@/lib/client/api";
import { startChatStream, type StreamHandle } from "@/lib/client/chat-stream";
import { useToast } from "@/components/system/ToastProvider";
import { useConfirm } from "@/components/system/ConfirmProvider";
import { parseProposedFileOps, summariseChange, type ParseNote, type ProposedOp } from "./parse-file-ops";
import type { ExplorerFile } from "./FileExplorer";

/**
 * The Code Studio assistant.
 *
 * Same streaming pipeline as Chat (`/api/ai/stream`), but scoped to a project:
 * the server injects the project description, its instructions and its file
 * contents, plus whichever file is open in the editor and the current selection.
 *
 * The assistant cannot write to the project. When its reply contains code
 * blocks with file paths, they are parsed into a review list; the user picks
 * which to apply, and only then does `apply-edits` write to the database.
 */

export type AssistantContext = {
  openFile: { path: string; content: string; language: string } | null;
  selection: string;
  /** Send every project file as context (the server trims to its budget). */
  includeProjectFiles: boolean;
};

type Row =
  | { id: string; role: "user"; content: string; pending?: boolean }
  | {
      id: string;
      role: "assistant";
      content: string;
      streaming?: boolean;
      failed?: string | null;
      stopped?: boolean;
      ops?: ProposedOp[];
      notes?: ParseNote[];
    };

type ApplyResult = {
  applied: { action: string; path: string; charsBefore: number; charsAfter: number }[];
  files: { id: string; path: string; content: string; language: string; updatedAt: string }[];
  counts: { created: number; updated: number; deleted: number };
};

let rowCounter = 0;
const nextRowId = () => `row_${(rowCounter += 1)}_${Date.now().toString(36)}`;

export function AssistantPanel({
  projectId,
  projectName,
  files,
  context,
  conversationId,
  onConversationCreated,
  onApply,
  onIncludeProjectFilesChange,
  models,
  defaultModel,
}: {
  projectId: string;
  projectName: string;
  files: ExplorerFile[];
  context: AssistantContext;
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
  /** Called with the paths that changed so the editor can refresh them. */
  onApply: (result: ApplyResult) => void | Promise<void>;
  onIncludeProjectFilesChange: (value: boolean) => void;
  models: { id: string; label: string; available: boolean }[];
  defaultModel: string | null;
}) {
  const toast = useToast();
  const { confirm: confirmDialog } = useConfirm();

  const [rows, setRows] = useState<Row[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState(defaultModel ?? "");
  const [meta, setMeta] = useState<{ providerLabel: string; modelLabel: string; demo: boolean } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);

  const streamRef = useRef<StreamHandle | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contextRef = useRef(context);
  contextRef.current = context;
  const conversationRef = useRef(conversationId);
  conversationRef.current = conversationId;

  const existingPaths = useMemo(() => new Set(files.map((file) => file.path)), [files]);
  const contentByPath = useMemo(() => new Map(files.map((file) => [file.path, file.content ?? ""])), [files]);

  /* ------------------------------------------- load an existing session --- */

  useEffect(() => {
    if (!conversationId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoadError(null);

    (async () => {
      try {
        const data = await api.get<{ messages: { id: string; role: string; content: string }[] }>(
          `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
        );
        if (cancelled) return;
        setRows(
          data.messages.map((message) => ({
            id: message.id,
            role: message.role === "assistant" ? "assistant" : "user",
            content: message.content,
            ...(message.role === "assistant" ? parsedFor(message.content) : {}),
          })) as Row[],
        );
      } catch (error) {
        if (!cancelled) setLoadError(errorMessage(error, "Delter AI could not load this assistant session."));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  function parsedFor(content: string) {
    const parsed = parseProposedFileOps(content, { existingPaths });
    return { ops: parsed.ops, notes: parsed.notes };
  }

  /* ------------------------------------------------------- auto-scroll --- */

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 140;
    if (nearBottom || busy) node.scrollTop = node.scrollHeight;
  }, [rows, busy]);

  useEffect(() => () => streamRef.current?.stop(), []);

  /* --------------------------------------------------------------- send --- */

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busy) return;

      setDraft("");
      setBusy(true);

      const userRow: Row = { id: nextRowId(), role: "user", content, pending: true };
      const assistantId = nextRowId();
      setRows((current) => [...current, userRow, { id: assistantId, role: "assistant", content: "", streaming: true }]);

      const active = contextRef.current;

      const handle = startChatStream(
        {
          conversationId: conversationRef.current,
          projectId,
          kind: "code",
          content,
          model: model || null,
          code: {
            openFilePath: active.openFile?.path ?? null,
            openFileLanguage: active.openFile?.language ?? null,
            selectedCode: active.selection || null,
            includeProjectFiles: active.includeProjectFiles,
            filePaths: files.map((file) => file.path),
          },
        },
        {
          onMeta: (event) => {
            setMeta({ providerLabel: event.providerLabel, modelLabel: event.modelLabel, demo: event.demo });
            if (!conversationRef.current) onConversationCreated(event.conversationId);
            setRows((current) =>
              current.map((row) => (row.id === userRow.id ? { ...row, pending: false } : row)),
            );
            if (event.fallback) {
              toast.warning("Using a fallback model", event.fallbackReason ?? undefined);
            }
          },
          onDelta: (chunk) => {
            setRows((current) =>
              current.map((row) =>
                row.id === assistantId && row.role === "assistant" ? { ...row, content: row.content + chunk } : row,
              ),
            );
          },
          onDone: (event) => {
            setRows((current) =>
              current.map((row) => {
                if (row.id !== assistantId || row.role !== "assistant") return row;
                const finalText = event.text || row.content;
                const parsed = parseProposedFileOps(finalText, { existingPaths });
                return { ...row, content: finalText, streaming: false, stopped: event.stopped, ops: parsed.ops, notes: parsed.notes };
              }),
            );
            setBusy(false);
            streamRef.current = null;
          },
          onError: (event) => {
            setRows((current) =>
              current.map((row) =>
                row.id === assistantId && row.role === "assistant"
                  ? {
                      ...row,
                      streaming: false,
                      failed: event.message,
                      // Keep whatever arrived: a half-written file is still useful.
                      content: event.partial ? row.content : row.content,
                      ...(row.content ? parsedFor(row.content) : {}),
                    }
                  : row,
              ),
            );
            setBusy(false);
            streamRef.current = null;
            toast.error("The assistant could not finish", event.message);
          },
        },
      );

      streamRef.current = handle;

      try {
        await handle.finished;
      } catch (error) {
        setBusy(false);
        streamRef.current = null;
        setRows((current) =>
          current.map((row) =>
            row.id === assistantId && row.role === "assistant"
              ? { ...row, streaming: false, failed: errorMessage(error, "Delter AI could not reach the model.") }
              : row,
          ),
        );
        toast.error("Request failed", errorMessage(error, "Delter AI could not reach the model."));
      }
    },
    [busy, conversationId, existingPaths, files, model, onConversationCreated, projectId, toast],
  );

  function stop() {
    streamRef.current?.stop();
    setBusy(false);
  }

  /* ------------------------------------------------------------- apply --- */

  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  function toggleOp(messageId: string, opId: string) {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(opId)) next.delete(opId);
      else next.add(opId);
      return next;
    });
    void messageId;
  }

  async function applyOps(row: Row & { role: "assistant" }) {
    const ops = (row.ops ?? []).filter((op) => !excluded.has(op.id));
    if (!ops.length) {
      toast.info("Nothing selected", "Tick at least one file change to apply.");
      return;
    }

    setApplying(row.id);
    try {
      const result = await api.post<ApplyResult>(
        `/api/projects/${encodeURIComponent(projectId)}/code-files/apply-edits`,
        {
          projectId,
          conversationId,
          operations: ops.map((op) => ({
            action: op.action === "delete" ? "delete" : existingPaths.has(op.path) ? "update" : "create",
            path: op.path,
            ...(op.action === "delete" ? {} : { content: op.content }),
          })),
        },
      );

      await onApply(result);

      const parts = [
        result.counts.created ? `${result.counts.created} created` : "",
        result.counts.updated ? `${result.counts.updated} updated` : "",
        result.counts.deleted ? `${result.counts.deleted} deleted` : "",
      ].filter(Boolean);
      toast.success("Changes applied to the project", parts.join(", "));
      setRows((current) => current.map((r) => (r.id === row.id && r.role === "assistant" ? { ...r, ops: [] } : r)));
    } catch (error) {
      toast.error("Could not apply those changes", errorMessage(error, "Delter AI could not write to the project."));
    } finally {
      setApplying(null);
    }
  }

  async function resetSession() {
    const ok = await confirmDialog({
      title: "Start a new assistant session?",
      description:
        "The current session stays in your project history — this only clears the panel so the next message starts a fresh conversation.",
      confirmLabel: "Start fresh",
      tone: "neutral",
    });
    if (!ok) return;
    streamRef.current?.stop();
    setBusy(false);
    setRows([]);
    setMeta(null);
    setExcluded(new Set());
    // The parent owns the URL; ask it to drop the session id.
    onConversationCreated("");
  }

  /* --------------------------------------------------------------- UI --- */

  const contextSummary = useMemo(() => {
    const bits: string[] = [];
    if (context.openFile) bits.push(context.openFile.path);
    if (context.selection) bits.push(`${context.selection.length.toLocaleString()} characters selected`);
    if (context.includeProjectFiles) bits.push(`${files.length} project file${files.length === 1 ? "" : "s"}`);
    return bits;
  }, [context, files.length]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <IconSparkle className="h-3.5 w-3.5 text-accent" />
            <h2 className="truncate text-[13px] font-semibold">Assistant</h2>
          </div>
          <p className="truncate text-[11.5px] text-fg-muted">
            {meta ? `${meta.providerLabel} · ${meta.modelLabel}${meta.demo ? " · demo" : ""}` : projectName}
          </p>
        </div>
        <button
          type="button"
          onClick={resetSession}
          className="shrink-0 rounded-md border border-border p-1.5 text-fg-muted hover:border-border-strong hover:text-fg"
          aria-label="Start a new assistant session"
          title="Start a new assistant session"
        >
          <IconRefresh className="h-4 w-4" />
        </button>
      </header>

      {/* What the model can actually see — stated plainly, not implied. */}
      <div className="border-b border-border bg-bg-subtle px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-fg-muted">Sees:</span>
          {contextSummary.length ? (
            contextSummary.map((bit) => (
              <Badge key={bit} tone="neutral" className="max-w-full">
                <span className="truncate">{bit}</span>
              </Badge>
            ))
          ) : (
            <span className="text-[11.5px] text-fg-faint">nothing beyond the project description</span>
          )}
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11.5px] text-fg-secondary">
            <input
              type="checkbox"
              checked={context.includeProjectFiles}
              onChange={(event) => onIncludeProjectFilesChange(event.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            All project files
          </label>
        </div>
        {models.length > 1 && (
          <div className="mt-2 flex items-center gap-1.5">
            <label htmlFor="assistant-model" className="text-[11px] font-medium text-fg-muted">
              Model
            </label>
            <select
              id="assistant-model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              disabled={busy}
              className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1 text-[11.5px] text-fg outline-none focus:border-accent"
            >
              {models.map((option) => (
                <option key={option.id} value={option.id} disabled={!option.available}>
                  {option.label}
                  {option.available ? "" : " — no key configured"}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loadError ? (
          <div className="rounded-lg border border-danger/40 bg-danger-soft p-3">
            <p className="text-[12.5px]" style={{ color: "var(--danger)" }}>
              {loadError}
            </p>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => window.location.reload()}>
              Reload Code Studio
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <EmptyAssistant files={files.length} hasOpenFile={Boolean(context.openFile)} onPrompt={send} disabled={busy} />
        ) : (
          <div className="space-y-4">
            {rows.map((row) =>
              row.role === "user" ? (
                <div key={row.id} className="flex justify-end">
                  <div className="max-w-[92%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-accent-soft px-3 py-2 text-[13px] text-fg">
                    {row.content}
                  </div>
                </div>
              ) : (
                <div key={row.id} className="space-y-2">
                  <div className="text-[13px]">
                    {row.content ? (
                      <Markdown source={row.content} streaming={row.streaming} />
                    ) : row.streaming ? (
                      <p className="flex items-center gap-2 text-[12.5px] text-fg-muted">
                        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                        Thinking…
                      </p>
                    ) : null}
                  </div>

                  {row.stopped && !row.streaming && (
                    <p className="text-[11.5px] text-fg-muted">You stopped this response. What arrived is kept.</p>
                  )}

                  {row.failed && (
                    <div className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2">
                      <p className="text-[12px]" style={{ color: "var(--danger)" }}>
                        {row.failed}
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-1.5"
                        disabled={busy}
                        onClick={() => {
                          // Retry re-sends the last user message.
                          const lastUser = [...rows].reverse().find((r) => r.role === "user");
                          if (lastUser && lastUser.role === "user") {
                            setRows((current) => current.filter((r) => r.id !== row.id));
                            void send(lastUser.content);
                          }
                        }}
                      >
                        Retry
                      </Button>
                    </div>
                  )}

                  {row.ops && row.ops.length > 0 && (
                    <ProposedChanges
                      ops={row.ops}
                      notes={row.notes ?? []}
                      excluded={excluded}
                      onToggle={(opId) => toggleOp(row.id, opId)}
                      onApply={() => applyOps(row)}
                      applying={applying === row.id}
                      busy={busy}
                      contentByPath={contentByPath}
                    />
                  )}

                  {(!row.ops || row.ops.length === 0) && row.notes && row.notes.length > 0 && !row.streaming && (
                    <Notes notes={row.notes} />
                  )}
                </div>
              ),
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-bg-subtle p-2.5">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={busy}
              onClick={() => void send(prompt)}
              className="rounded-full border border-border bg-bg px-2.5 py-1 text-[11.5px] text-fg-secondary hover:border-border-strong hover:text-fg disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-2 rounded-lg border border-border bg-bg p-2 focus-within:border-accent">
          <textarea
            ref={textareaRef}
            value={draft}
            rows={2}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && window.matchMedia("(pointer: fine)").matches) {
                event.preventDefault();
                void send(draft);
              }
            }}
            placeholder={
              context.openFile
                ? `Ask about ${context.openFile.path.split("/").pop()}…`
                : "Ask the assistant to build or fix something…"
            }
            aria-label="Message the Code Studio assistant"
            className="min-h-[44px] flex-1 resize-none bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-faint disabled:opacity-60"
          />
          {busy ? (
            <Button size="sm" variant="secondary" onClick={stop} aria-label="Stop generating">
              <IconStop className="h-3.5 w-3.5" />
              Stop
            </Button>
          ) : (
            <Button size="sm" onClick={() => void send(draft)} disabled={!draft.trim()} aria-label="Send message">
              <IconSend className="h-3.5 w-3.5" />
              Send
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

const QUICK_PROMPTS = [
  "Explain this file",
  "Find bugs in my selection",
  "Rewrite the open file completely",
  "Add a missing index.html",
];

function EmptyAssistant({
  files,
  hasOpenFile,
  onPrompt,
  disabled,
}: {
  files: number;
  hasOpenFile: boolean;
  onPrompt: (text: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3 py-4">
      <div className="rounded-lg border border-border bg-bg-subtle p-3">
        <p className="text-[12.5px] font-medium">The assistant works on real files</p>
        <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">
          It reads this project{files ? `, all ${files} file${files === 1 ? "" : "s"} in it` : ""}
          {hasOpenFile ? ", the file open in your editor" : ""} and your selection. It proposes changes; nothing is
          written until you press Apply.
        </p>
      </div>

      <div className="space-y-1.5">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={disabled}
            onClick={() => onPrompt(prompt)}
            className="flex w-full items-center gap-2 rounded-md border border-border bg-bg px-3 py-2 text-left text-[12.5px] text-fg-secondary hover:border-border-strong hover:text-fg disabled:opacity-50"
          >
            <IconFileCode className="h-3.5 w-3.5 shrink-0 text-fg-faint" />
            {prompt}
          </button>
        ))}
      </div>

      {!hasOpenFile && (
        <p className="text-[11.5px] text-fg-faint">
          Open a file on the left to give the assistant something specific to work on.
        </p>
      )}
    </div>
  );
}

function ProposedChanges({
  ops,
  notes,
  excluded,
  onToggle,
  onApply,
  applying,
  busy,
  contentByPath,
}: {
  ops: ProposedOp[];
  notes: ParseNote[];
  excluded: Set<string>;
  onToggle: (opId: string) => void;
  onApply: () => void;
  applying: boolean;
  busy: boolean;
  contentByPath: Map<string, string>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const selected = ops.filter((op) => !excluded.has(op.id));

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg-subtle">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold">
            {ops.length} file change{ops.length === 1 ? "" : "s"} proposed
          </p>
          <p className="text-[11.5px] text-fg-muted">
            {selected.length} selected · nothing is written until you apply
          </p>
        </div>
        <Button size="sm" onClick={onApply} disabled={busy || applying || selected.length === 0}>
          {applying ? "Applying…" : "Apply"}
        </Button>
      </div>

      <ul className="divide-y divide-border">
        {ops.map((op) => {
          const previous = contentByPath.get(op.path);
          const isNew = previous === undefined;
          const change = isNew || op.action === "delete" ? null : summariseChange(previous ?? "", op.content);
          const isOpen = expanded === op.id;

          return (
            <li key={op.id} className="px-2.5 py-2">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={!excluded.has(op.id)}
                  onChange={() => onToggle(op.id)}
                  aria-label={`Apply the change to ${op.path}`}
                  className="mt-1 h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={op.action === "delete" ? "danger" : isNew ? "success" : "accent"}>
                      {op.action === "delete" ? "delete" : isNew ? "create" : "update"}
                    </Badge>
                    <span className="truncate font-mono text-[12px] text-fg">{op.path}</span>
                    {change && (
                      <span className="text-[11px] text-fg-muted">
                        <span style={{ color: "var(--success)" }}>+{change.added}</span>{" "}
                        <span style={{ color: "var(--danger)" }}>−{change.removed}</span>
                      </span>
                    )}
                    {op.action !== "delete" && (
                      <span className="text-[11px] text-fg-faint">{op.chars.toLocaleString()} chars</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-fg-faint">path from {op.pathSource}</p>

                  {op.action !== "delete" && (
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : op.id)}
                      className="mt-1 text-[11.5px] text-accent-text hover:underline"
                      aria-expanded={isOpen}
                    >
                      {isOpen ? "Hide contents" : "Review contents"}
                    </button>
                  )}

                  {isOpen && (
                    <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-border bg-bg p-2 font-mono text-[11.5px] leading-relaxed text-fg-secondary">
                      {op.content || "(empty file)"}
                    </pre>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {notes.length > 0 && (
        <div className="border-t border-border px-3 py-2">
          <Notes notes={notes} />
        </div>
      )}
    </div>
  );
}

function Notes({ notes }: { notes: ParseNote[] }) {
  if (!notes.length) return null;
  return (
    <ul className="space-y-1">
      {notes.map((note) => (
        <li key={note.id} className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-fg-muted">
          <IconClose className="mt-[3px] h-3 w-3 shrink-0 text-warning" />
          <span>{note.message.replace(/`/g, "")}</span>
        </li>
      ))}
    </ul>
  );
}

export type { ApplyResult };
