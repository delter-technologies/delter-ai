"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Modal, ModalFooterActions } from "@/components/ui/Modal";
import { Menu, MenuTriggerButton } from "@/components/ui/Menu";
import { Badge, EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import {
  IconAlert,
  IconCheck,
  IconCode,
  IconEye,
  IconFileCode,
  IconFolder,
  IconPanelLeft,
  IconPencil,
  IconPlus,
  IconSave,
  IconSparkle,
  IconTerminal,
  IconTrash,
} from "@/components/ui/Icons";
import { api, ClientApiError, errorMessage } from "@/lib/client/api";
import { relativeTime } from "@/lib/client/format";
import { useToast } from "@/components/system/ToastProvider";
import { useConfirm } from "@/components/system/ConfirmProvider";
import { CodeEditor, type CodeEditorHandle, type EditorLanguage } from "./CodeEditor";
import { FileExplorer, type ExplorerFile } from "./FileExplorer";
import { AssistantPanel, type ApplyResult } from "./AssistantPanel";
import { PreviewPanel, type PreviewStatusPayload } from "./PreviewPanel";
import { TerminalPanel, type TerminalEntry } from "./TerminalPanel";

/**
 * Code Studio.
 *
 * Four surfaces over one project, all of them real:
 *   editor     — CodeMirror over files stored in the database, autosaved,
 *                with optimistic-concurrency protection against a second tab
 *   explorer   — the project's file tree, derived from stored paths
 *   assistant  — the same streaming pipeline as Chat, scoped to this project;
 *                it proposes file changes that only you can apply
 *   preview    — an authenticated, sandboxed render of the saved HTML/CSS/JS/MD
 *   activity   — a log of what actually happened (there is no shell to fake)
 */

export type CodeProjectOption = {
  id: string;
  name: string;
  kind: string;
  description: string | null;
  instructions: string | null;
  pinned: boolean;
  codeFileCount: number;
};

export type CodeModelOption = { id: string; label: string; available: boolean };

export type InitialOpenFile = {
  id: string;
  path: string;
  language: string;
  content: string;
  updatedAt: string;
};

const LANGUAGE_BY_EXTENSION: Record<string, EditorLanguage> = {
  ts: "typescript", mts: "typescript", cts: "typescript", tsx: "tsx",
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "jsx",
  html: "html", htm: "html", css: "css", json: "json",
  md: "markdown", markdown: "markdown", mdx: "markdown", py: "python",
};

function languageForPath(path: string): EditorLanguage {
  const name = path.toLowerCase();
  if (name.endsWith(".gitignore") || name.endsWith(".env") || name === "dockerfile") return "text";
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  return LANGUAGE_BY_EXTENSION[ext] ?? "text";
}

const STARTERS: Partial<Record<EditorLanguage, string>> = {
  html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>New page</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main>
      <h1>New page</h1>
      <p>Written in Code Studio, stored in your project, previewed on the right.</p>
    </main>
    <script src="script.js"></script>
  </body>
</html>
`,
  css: `body {
  margin: 0;
  font-family: system-ui, sans-serif;
  line-height: 1.6;
}
`,
  javascript: `// Runs in the preview pane when this file is linked from your HTML.
document.addEventListener("DOMContentLoaded", () => {
  console.log("ready");
});
`,
  markdown: `# New document

Write here. The preview pane renders Markdown as a document.
`,
};

type SaveState = "idle" | "saving" | "saved" | "error";

type MobileTab = "code" | "preview" | "assistant" | "activity";

export function CodeStudio({
  projects,
  initialProject,
  initialFiles,
  initialOpenFile,
  initialPreview,
  initialSessionId,
  limits,
  models,
  defaultModel,
  demoMode,
}: {
  projects: CodeProjectOption[];
  initialProject: CodeProjectOption | null;
  initialFiles: ExplorerFile[];
  initialOpenFile: InitialOpenFile | null;
  initialPreview: PreviewStatusPayload | null;
  initialSessionId: string | null;
  limits: { maxFiles: number; maxFileChars: number };
  models: CodeModelOption[];
  defaultModel: string | null;
  demoMode: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm: confirmDialog } = useConfirm();

  /* ------------------------------------------------------------- state --- */

  const projectOptions = projects;
  const [project, setProject] = useState<CodeProjectOption | null>(initialProject);
  const [files, setFiles] = useState<ExplorerFile[]>(
    initialOpenFile
      ? initialFiles.map((file) => (file.id === initialOpenFile.id ? { ...file, content: initialOpenFile.content } : file))
      : initialFiles,
  );
  const [preview, setPreview] = useState<PreviewStatusPayload | null>(initialPreview);
  const [previewKey, setPreviewKey] = useState(0);

  const [activeId, setActiveId] = useState<string | null>(initialOpenFile?.id ?? initialFiles[0]?.id ?? null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [savedAt, setSavedAt] = useState<Record<string, number>>({});
  const [saveError, setSaveError] = useState<{ fileId: string; message: string } | null>(null);
  const [conflict, setConflict] = useState<{ fileId: string; message: string; serverUpdatedAt: string } | null>(null);
  const [fetchingContent, setFetchingContent] = useState<string | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);

  const [explorerOpen, setExplorerOpen] = useState(true);
  const [rightView, setRightView] = useState<"assistant" | "preview">("assistant");
  const [activityOpen, setActivityOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("code");

  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [includeProjectFiles, setIncludeProjectFiles] = useState(true);
  const [selection, setSelection] = useState("");
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [entries, setEntries] = useState<TerminalEntry[]>([]);

  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");
  const [newFileBusy, setNewFileBusy] = useState(false);
  const [newFileError, setNewFileError] = useState<string | null>(null);

  const [renameTarget, setRenameTarget] = useState<ExplorerFile | null>(null);
  const [renamePath, setRenamePath] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const editorHandle = useRef<CodeEditorHandle | null>(null);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const filesRef = useRef(files);
  filesRef.current = files;
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  /* ------------------------------------------------------------ helpers --- */

  const log = useCallback((tone: TerminalEntry["tone"], label: string, message: string) => {
    setEntries((current) =>
      [...current, { id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, at: Date.now(), tone, label, message }].slice(-200),
    );
  }, []);

  const activeFile = useMemo(() => files.find((file) => file.id === activeId) ?? null, [files, activeId]);

  const contentOf = useCallback(
    (file: ExplorerFile | null) => {
      if (!file) return "";
      const draft = draftsRef.current[file.id];
      return draft !== undefined ? draft : file.content ?? "";
    },
    [],
  );

  const dirtyIds = useMemo(() => {
    const set = new Set<string>();
    for (const file of files) {
      const draft = drafts[file.id];
      if (draft !== undefined && draft !== (file.content ?? "")) set.add(file.id);
    }
    return set;
  }, [files, drafts]);

  const dirty = activeFile ? dirtyIds.has(activeFile.id) : false;

  /* --------------------------------------------------------- load files --- */

  const loadFiles = useCallback(
    async (options: { quiet?: boolean } = {}): Promise<ExplorerFile[]> => {
      if (!project) return [];
      try {
        const data = await api.get<{
          files: ExplorerFile[];
          preview: PreviewStatusPayload | null;
          limits: { maxFiles: number; maxFileChars: number };
        }>(`/api/projects/${encodeURIComponent(project.id)}/code-files?contents=1`);

        const merged = data.files.map((file) => {
          // Never throw away an unsaved draft: keep typing through a refresh.
          const draft = draftsRef.current[file.id];
          const previous = filesRef.current.find((row) => row.id === file.id);
          return {
            ...file,
            content: draft !== undefined ? draft : file.content,
            // If the server copy moved on while we had a draft, keep the older
            // timestamp so the next save can detect a conflict instead of
            // silently overwriting a newer version.
            updatedAt: draft !== undefined && previous ? previous.updatedAt : file.updatedAt,
          };
        });
        filesRef.current = merged;
        setFiles(merged);
        setPreview(data.preview);
        setLoadError(null);
        return merged;
      } catch (error) {
        const message = errorMessage(error, "Delter AI could not load this project's files.");
        setLoadError(message);
        if (!options.quiet) toast.error("Could not load files", message);
        return [];
      }
    },
    [project, toast],
  );

  // Hydrate full contents once on mount (the server sent only the open file).
  useEffect(() => {
    if (!project) return;
    void loadFiles({ quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  /* ---------------------------------------------------------- deep links --- */

  // Keep the address bar shareable. This uses the native history API (which the
  // App Router stays in sync with) rather than router.replace, because opening a
  // file must not trigger a server round-trip: that would refetch the project on
  // every keystroke-driven file switch and re-run the page's database queries.
  useEffect(() => {
    if (!project) return;
    const params = new URLSearchParams();
    params.set("project", project.id);
    if (activeFile) params.set("file", activeFile.path);
    if (sessionId) params.set("session", sessionId);
    const next = `/app/code?${params.toString()}`;
    if (window.location.pathname + window.location.search !== next) {
      window.history.replaceState(null, "", next);
    }
  }, [project, activeFile?.path, sessionId]);

  /* --------------------------------------------- fetch a file's contents --- */

  const ensureContent = useCallback(
    async (file: ExplorerFile): Promise<ExplorerFile | null> => {
      if (file.content !== undefined || !project) return file;
      setFetchingContent(file.id);
      try {
        const data = await api.get<{ file: ExplorerFile & { content: string; chars: number; lines: number } }>(
          `/api/projects/${encodeURIComponent(project.id)}/code-files/${encodeURIComponent(file.id)}`,
        );
        const loaded: ExplorerFile = { ...file, content: data.file.content, updatedAt: data.file.updatedAt };
        setFiles((current) => current.map((row) => (row.id === file.id ? loaded : row)));
        return loaded;
      } catch (error) {
        toast.error("Could not open that file", errorMessage(error, "Delter AI could not read it."));
        return null;
      } finally {
        setFetchingContent(null);
      }
    },
    [project, toast],
  );

  /* ---------------------------------------------------------------- save --- */

  /** Result of a save attempt, so autosave can react differently to a conflict. */
  type SaveOutcome = "saved" | "unchanged" | "conflict" | "error";

  const saveFile = useCallback(
    async (fileId: string, options: { force?: boolean; quiet?: boolean } = {}): Promise<SaveOutcome> => {
      const file = filesRef.current.find((row) => row.id === fileId);
      if (!file || !project) return "error";

      const content = draftsRef.current[fileId] ?? file.content ?? "";
      if (content === (file.content ?? "") && !options.force) {
        setSaveStates((current) => ({ ...current, [fileId]: "saved" }));
        setDrafts((current) => {
          const next = { ...current };
          delete next[fileId];
          return next;
        });
        return "unchanged";
      }

      if (content.length > limits.maxFileChars) {
        const message = `That file is too large to store (limit ≈ ${Math.round(limits.maxFileChars / 1024)} KB of text).`;
        setSaveStates((current) => ({ ...current, [fileId]: "error" }));
        setSaveError({ fileId, message });
        log("danger", "save failed", `${file.path} — ${message}`);
        return "error";
      }

      setSaveStates((current) => ({ ...current, [fileId]: "saving" }));
      setSaveError((current) => (current?.fileId === fileId ? null : current));

      try {
        const data = await api.put<{ file: ExplorerFile & { content: string }; saved: boolean; unchanged: boolean }>(
          `/api/projects/${encodeURIComponent(project.id)}/code-files/${encodeURIComponent(fileId)}`,
          options.force
            ? { content }
            : { content, expectedUpdatedAt: file.updatedAt },
        );

        setFiles((current) =>
          current.map((row) =>
            row.id === fileId
              ? { ...row, content: data.file.content, updatedAt: data.file.updatedAt, language: data.file.language }
              : row,
          ),
        );
        setDrafts((current) => {
          const next = { ...current };
          delete next[fileId];
          return next;
        });
        setSaveStates((current) => ({ ...current, [fileId]: "saved" }));
        setSavedAt((current) => ({ ...current, [fileId]: Date.now() }));
        setConflict((current) => (current?.fileId === fileId ? null : current));
        setPreviewKey((key) => key + 1);
        if (data.saved) log("success", "saved", `${file.path} · ${content.length.toLocaleString()} characters`);
        return data.saved ? "saved" : "unchanged";
      } catch (error) {
        const message = errorMessage(error, "Delter AI could not save that file.");
        // The server answers 409 `stale_write` when the stored copy is newer.
        const isConflict = error instanceof ClientApiError && error.code === "stale_write";

        if (isConflict) {
          setConflict({ fileId, message, serverUpdatedAt: String(error.extra.serverUpdatedAt ?? "") });
          log("danger", "save conflict", `${file.path} — the file changed on the server after you opened it`);
        } else {
          setSaveError({ fileId, message });
          log("danger", "save failed", `${file.path} — ${message}`);
        }
        setSaveStates((current) => ({ ...current, [fileId]: "error" }));
        if (!options.quiet) toast.error("Save failed", message);
        return isConflict ? "conflict" : "error";
      }
    },
    [limits.maxFileChars, log, project, toast],
  );

  /** Debounced autosave — one pending write per file. */
  const scheduleSave = useCallback(
    (fileId: string) => {
      const existing = saveTimers.current.get(fileId);
      if (existing) clearTimeout(existing);
      saveTimers.current.set(
        fileId,
        setTimeout(() => {
          saveTimers.current.delete(fileId);
          void saveFile(fileId, { quiet: true }).then((outcome) => {
            // A conflict already has its own banner with two real choices; only a
            // genuine failure needs a toast as well.
            if (outcome === "error") {
              toast.warning("Autosave did not complete", "Your edits are still in the editor. Use Save to retry.");
            }
          });
        }, 1200),
      );
    },
    [saveFile, toast],
  );

  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const flushActive = useCallback(async () => {
    if (activeFile && dirtyIds.has(activeFile.id)) await saveFile(activeFile.id);
  }, [activeFile, dirtyIds, saveFile]);

  // Warn before leaving with unsaved edits (browser navigation or reload).
  useEffect(() => {
    if (!dirtyIds.size) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirtyIds.size]);

  /* -------------------------------------------------------------- open --- */

  const openFile = useCallback(
    async (file: ExplorerFile) => {
      await flushActive();
      const loaded = await ensureContent(file);
      if (!loaded) return;
      setActiveId(loaded.id);
      setMobileTab("code");
      log("info", "opened", loaded.path);
    },
    [ensureContent, flushActive, log],
  );

  /* ------------------------------------------------------- create file --- */

  async function createFile() {
    if (!project) return;
    const path = newFilePath.trim().replace(/^\/+/, "");
    if (!path) {
      setNewFileError("Enter a file name, for example `index.html`.");
      return;
    }
    if (files.some((file) => file.path === path)) {
      setNewFileError("This project already has a file at that path.");
      return;
    }
    if (files.length >= limits.maxFiles) {
      setNewFileError(`This project is at its ${limits.maxFiles}-file limit. Delete a file first.`);
      return;
    }

    setNewFileBusy(true);
    setNewFileError(null);
    try {
      const language = languageForPath(path);
      const created = await api.post<{ file: ExplorerFile & { content: string } }>(
        `/api/projects/${encodeURIComponent(project.id)}/code-files`,
        { path, content: STARTERS[language] ?? "" },
      );
      const fresh = await loadFiles({ quiet: true });
      setActiveId(fresh.find((row) => row.path === path)?.id ?? created.file.id);
      setMobileTab("code");
      setNewFileOpen(false);
      setNewFilePath("");
      log("success", "created", created.file.path);
      toast.success("File created", created.file.path);
    } catch (error) {
      setNewFileError(errorMessage(error, "Delter AI could not create that file."));
    } finally {
      setNewFileBusy(false);
    }
  }

  /* ------------------------------------------------------- rename file --- */

  async function renameFile() {
    if (!project || !renameTarget) return;
    const path = renamePath.trim().replace(/^\/+/, "");
    if (!path) {
      setRenameError("Enter a path, for example `src/index.html`.");
      return;
    }

    setRenameBusy(true);
    setRenameError(null);
    try {
      await api.patch<{ file: ExplorerFile & { content: string } }>(
        `/api/projects/${encodeURIComponent(project.id)}/code-files/${encodeURIComponent(renameTarget.id)}`,
        { path },
      );
      // A rename can change the language, so reload rather than patch locally.
      await loadFiles({ quiet: true });
      log("info", "moved", `${renameTarget.path} → ${path}`);
      toast.success("File moved", path);
      setRenameTarget(null);
    } catch (error) {
      setRenameError(errorMessage(error, "Delter AI could not move that file."));
    } finally {
      setRenameBusy(false);
    }
  }

  /* ------------------------------------------------------- delete file --- */

  async function deleteFile(file: ExplorerFile) {
    if (!project) return;
    const content = drafts[file.id] ?? file.content ?? "";
    const proceed = await confirmDialog({
      title: `Delete ${file.path}?`,
      description: (
        <span>
          This removes the file and its {content.length.toLocaleString()} stored characters from the project. Applied
          AI edits that wrote this file stay in the assistant history, but the file itself cannot be restored from Code
          Studio.
        </span>
      ),
      confirmLabel: "Delete file",
      tone: "danger",
    });
    if (!proceed) return;

    try {
      await api.del(`/api/projects/${encodeURIComponent(project.id)}/code-files/${encodeURIComponent(file.id)}`);
      if (activeId === file.id) setActiveId(null);
      setDrafts((current) => {
        const next = { ...current };
        delete next[file.id];
        return next;
      });
      await loadFiles({ quiet: true });
      log("warning", "deleted", file.path);
      toast.success("File deleted", file.path);
    } catch (error) {
      toast.error("Could not delete that file", errorMessage(error, "Delter AI could not delete it."));
    }
  }

  /* --------------------------------------------------- project switching --- */

  async function switchProject(nextId: string) {
    const next = projectOptions.find((option) => option.id === nextId);
    if (!next || next.id === project?.id) return;

    await flushActive();
    setProject(next);
    setActiveId(null);
    setFiles([]);
    setDrafts({});
    setPreview(null);
    setSessionId(null);
    setConflict(null);
    setSaveError(null);
    log("info", "project", `switched to ${next.name}`);
  }

  async function createProjectFromStudio() {
    router.push("/app/projects");
  }

  /* --------------------------------------------------- assistant apply --- */

  const handleApply = useCallback(
    async (result: ApplyResult) => {
      for (const op of result.applied) {
        log(
          op.action === "delete" ? "warning" : "success",
          `ai ${op.action}`,
          `${op.path} · ${op.charsBefore.toLocaleString()} → ${op.charsAfter.toLocaleString()} characters`,
        );
      }
      const fresh = await loadFiles({ quiet: true });
      setPreviewKey((key) => key + 1);

      // If the assistant overwrote the file that is open, push the stored content
      // into the editor. Without this the buffer can keep showing the old text
      // when the editor still has focus (its own value-sync skips focused views).
      const openApplied = result.files.find(
        (file) => file.id === activeId || file.path === filesRef.current.find((row) => row.id === activeId)?.path,
      );
      if (openApplied) editorHandle.current?.setContent(openApplied.content);

      // Open the first file the assistant touched so the change is visible.
      const firstPath = result.applied.find((op) => op.action !== "delete")?.path;
      if (firstPath) {
        const file = fresh.find((row) => row.path === firstPath);
        if (file) {
          setActiveId(file.id);
          setMobileTab("code");
        }
      }
      // A file the assistant overwrote may have had local edits; drop them so
      // what you see is what was stored.
      setDrafts((current) => {
        const next = { ...current };
        for (const file of result.files) delete next[file.id];
        return next;
      });
    },
    [activeId, loadFiles, log],
  );

  /* ------------------------------------------------------- keyboard --- */

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void flushActive();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flushActive]);

  /* ------------------------------------------------------------- view --- */

  const entryCandidates = useMemo(
    () => files.filter((file) => file.language === "html" || file.language === "markdown").map((file) => file.path),
    [files],
  );

  const saveLabel = (() => {
    if (!activeFile) return "";
    const state = saveStates[activeFile.id];
    if (conflict?.fileId === activeFile.id) return "Save conflict";
    if (state === "saving") return "Saving…";
    if (state === "error") return "Save failed";
    if (dirty) return "Unsaved changes";
    const at = savedAt[activeFile.id];
    return at ? `Saved ${new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Saved";
  })();

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={<IconCode className="h-6 w-6" />}
          title="Code Studio needs a project"
          description="Code files live inside a project, so the assistant, the preview and the file tree all have one place to work from. Create a project first — the Static website template comes with a working page you can preview immediately."
          action={
            <Button variant="primary" onClick={createProjectFromStudio} icon={<IconPlus className="h-4 w-4" />}>
              Go to Projects
            </Button>
          }
          secondaryAction={
            projectOptions.length ? (
              <span className="text-[12.5px] text-fg-muted">
                {projectOptions.length} project{projectOptions.length === 1 ? "" : "s"} exist but none were loadable —
                reload the page to try again.
              </span>
            ) : undefined
          }
        />
      </div>
    );
  }

  const editorValue = contentOf(activeFile);
  const editorLanguage = (activeFile?.language as EditorLanguage) ?? languageForPath(activeFile?.path ?? "");
  const activeConflict = conflict && activeFile && conflict.fileId === activeFile.id ? conflict : null;
  const activeSaveError =
    !activeConflict && saveError && activeFile && saveError.fileId === activeFile.id ? saveError : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ------------------------------------------------------- toolbar --- */}
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <button
          type="button"
          onClick={() => setExplorerOpen((value) => !value)}
          className="hidden shrink-0 rounded-md border border-border p-1.5 text-fg-muted hover:border-border-strong hover:text-fg lg:block"
          aria-label={explorerOpen ? "Hide file explorer" : "Show file explorer"}
          aria-pressed={explorerOpen}
          title={explorerOpen ? "Hide file explorer" : "Show file explorer"}
        >
          <IconPanelLeft className="h-4 w-4" />
        </button>

        <label className="sr-only" htmlFor="code-project">
          Project
        </label>
        <select
          id="code-project"
          value={project.id}
          onChange={(event) => void switchProject(event.target.value)}
          className="max-w-[190px] min-w-0 rounded-md border border-border bg-bg px-2 py-1.5 text-[12.5px] font-medium text-fg outline-none focus:border-accent"
        >
          {projectOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>

        <Badge tone={project.kind === "web" ? "accent" : "neutral"}>{project.kind}</Badge>

        <div className="hidden min-w-0 items-center gap-1.5 md:flex">
          <IconFolder className="h-3.5 w-3.5 shrink-0 text-fg-faint" />
          <span className="truncate font-mono text-[12px] text-fg-secondary" title={activeFile?.path}>
            {activeFile?.path ?? "No file open"}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <span
            className={`hidden items-center gap-1.5 text-[11.5px] sm:flex ${
              saveStates[activeFile?.id ?? ""] === "error" || conflict ? "text-danger" : "text-fg-muted"
            }`}
            aria-live="polite"
          >
            {saveStates[activeFile?.id ?? ""] === "saved" && !dirty ? (
              <IconCheck className="h-3.5 w-3.5" style={{ color: "var(--success)" }} />
            ) : null}
            {conflict?.fileId === activeFile?.id ? <IconAlert className="h-3.5 w-3.5" /> : null}
            {saveLabel}
          </span>

          <Button
            size="sm"
            variant={dirty ? "primary" : "secondary"}
            onClick={() => void flushActive()}
            disabled={!activeFile || !dirty || saveStates[activeFile?.id ?? ""] === "saving"}
            icon={<IconSave className="h-3.5 w-3.5" />}
            title="Save (⌘S / Ctrl+S)"
          >
            Save
          </Button>

          <div className="hidden items-center gap-1 sm:flex">
            <Button
              size="sm"
              variant={rightView === "assistant" ? "secondary" : "ghost"}
              onClick={() => setRightView("assistant")}
              icon={<IconSparkle className="h-3.5 w-3.5" />}
              aria-pressed={rightView === "assistant"}
            >
              Assistant
            </Button>
            <Button
              size="sm"
              variant={rightView === "preview" ? "secondary" : "ghost"}
              onClick={() => {
                setRightView("preview");
                setMobileTab("preview");
              }}
              icon={<IconEye className="h-3.5 w-3.5" />}
              aria-pressed={rightView === "preview"}
            >
              Preview
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setActivityOpen((value) => !value)}
              icon={<IconTerminal className="h-3.5 w-3.5" />}
              aria-pressed={activityOpen}
              title="Activity log"
            />
          </div>
        </div>
      </header>

      {loadError && (
        <div className="border-b border-border bg-danger-soft px-3 py-2">
          <ErrorState
            title="Could not load this project's files"
            message={loadError}
            onRetry={() => void loadFiles()}
            compact
          />
        </div>
      )}

      {/* --------------------------------------------------------- body --- */}
      <div className="flex min-h-0 flex-1">
        {/* Desktop explorer */}
        <aside
          className={`${explorerOpen ? "lg:flex" : "lg:hidden"} hidden w-[232px] shrink-0 flex-col border-r border-border bg-surface`}
        >
          <FileExplorer
            files={files}
            activeFileId={activeId}
            dirtyFileIds={dirtyIds}
            onOpen={(file) => void openFile(file)}
            onCreate={() => {
              setNewFilePath("");
              setNewFileError(null);
              setNewFileOpen(true);
            }}
            onRename={(file) => {
              setRenameTarget(file);
              setRenamePath(file.path);
              setRenameError(null);
            }}
            onDelete={(file) => void deleteFile(file)}
          />
        </aside>

        {/* Editor */}
        <section
          className={`${mobileTab === "code" ? "flex" : "hidden"} min-w-0 flex-1 flex-col lg:flex`}
          aria-label="Code editor"
        >
          {/* Mobile file chips: no room for a tree, so a real horizontal list. */}
          <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border bg-bg-subtle px-2 py-1.5 lg:hidden">
            {files.length === 0 ? (
              <span className="px-1 text-[11.5px] text-fg-muted">No files yet</span>
            ) : (
              files.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => void openFile(file)}
                  className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[11.5px] ${
                    file.id === activeId
                      ? "border-accent bg-accent-soft text-fg"
                      : "border-border bg-bg text-fg-secondary"
                  }`}
                >
                  {file.name}
                  {dirtyIds.has(file.id) ? " •" : ""}
                </button>
              ))
            )}
            <button
              type="button"
              onClick={() => {
                setNewFilePath("");
                setNewFileError(null);
                setNewFileOpen(true);
              }}
              className="shrink-0 rounded-full border border-dashed border-border px-2.5 py-1 text-[11.5px] text-fg-muted"
              aria-label="New file"
            >
              + New
            </button>

            {/* Touch devices have no hover, so the file actions live here too. */}
            {activeFile ? (
              <span className="ml-auto shrink-0 pl-2">
                <Menu
                  items={[
                    {
                      key: "rename",
                      label: "Rename or move…",
                      icon: <IconPencil size={14} />,
                      onSelect: () => {
                        setRenameTarget(activeFile);
                        setRenamePath(activeFile.path);
                        setRenameError(null);
                      },
                    },
                    {
                      key: "delete",
                      label: "Delete file",
                      icon: <IconTrash size={14} />,
                      tone: "danger",
                      onSelect: () => void deleteFile(activeFile),
                    },
                  ]}
                  align="end"
                  ariaLabel={`Actions for ${activeFile.path}`}
                  trigger={MenuTriggerButton("File actions")}
                />
              </span>
            ) : null}
          </div>

          {activeConflict && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-warning-soft px-3 py-2">
              <IconAlert className="h-4 w-4 shrink-0" style={{ color: "var(--warning)" }} />
              <p className="min-w-0 flex-1 text-[12px] leading-snug text-fg-secondary">{activeConflict.message}</p>
              <div className="flex shrink-0 gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    // Discard the local draft and take the server's newer copy.
                    const fileId = activeConflict.fileId;
                    setDrafts((current) => {
                      const next = { ...current };
                      delete next[fileId];
                      return next;
                    });
                    setConflict(null);
                    await loadFiles({ quiet: true });
                    log("info", "reloaded", `${activeFile?.path} — kept the server version`);
                  }}
                >
                  Keep server version
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => void saveFile(activeConflict.fileId, { force: true })}
                  title="Saves your version and discards the newer copy on the server"
                >
                  Overwrite with mine
                </Button>
              </div>
            </div>
          )}

          {activeSaveError && (
            <div className="flex items-center gap-2 border-b border-border bg-danger-soft px-3 py-2">
              <IconAlert className="h-4 w-4 shrink-0" style={{ color: "var(--danger)" }} />
              <p className="min-w-0 flex-1 text-[12px] text-fg-secondary">{activeSaveError.message}</p>
              <Button size="sm" variant="secondary" onClick={() => void saveFile(activeSaveError.fileId)}>
                Retry save
              </Button>
            </div>
          )}

          <div className="relative min-h-0 flex-1 bg-bg">
            {!activeFile ? (
              <div className="flex h-full items-center justify-center p-6">
                {files.length === 0 ? (
                  <EmptyState
                    icon={<IconFileCode className="h-6 w-6" />}
                    title="This project has no files yet"
                    description="Create the first file yourself, or ask the assistant to scaffold the project — either way the files are stored in this project and stay here when you come back."
                    action={
                      <Button
                        variant="primary"
                        icon={<IconPlus className="h-4 w-4" />}
                        onClick={() => {
                          setNewFilePath("");
                          setNewFileError(null);
                          setNewFileOpen(true);
                        }}
                      >
                        New file
                      </Button>
                    }
                    secondaryAction={
                      <Button
                        variant="ghost"
                        icon={<IconSparkle className="h-4 w-4" />}
                        onClick={() => {
                          setRightView("assistant");
                          setMobileTab("assistant");
                        }}
                      >
                        Ask the assistant
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={<IconFileCode className="h-6 w-6" />}
                    title="No file open"
                    description="Pick a file from the explorer to start editing."
                    compact
                  />
                )}
              </div>
            ) : fetchingContent === activeFile.id ? (
              <div className="flex h-full items-center justify-center">
                <LoadingState label={`Loading ${activeFile.path}…`} />
              </div>
            ) : activeFile.content === undefined && drafts[activeFile.id] === undefined ? (
              <div className="flex h-full items-center justify-center">
                <LoadingState label="Loading file contents…" />
              </div>
            ) : (
              <CodeEditor
                handleRef={editorHandle}
                filePath={activeFile.path}
                language={editorLanguage}
                value={editorValue}
                onChange={(content) => {
                  setDrafts((current) => ({ ...current, [activeFile.id]: content }));
                  scheduleSave(activeFile.id);
                }}
                onSaveRequest={() => void saveFile(activeFile.id)}
                onCursor={(info) => {
                  setSelection(info.selection);
                  setCursor({ line: info.line, column: info.column });
                }}
              />
            )}
          </div>

          {/* Status bar */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-bg-subtle px-3 py-1.5 text-[11.5px] text-fg-muted">
            {activeFile ? (
              <>
                <span>{activeFile.languageLabel}</span>
                <span>
                  Ln {cursor.line}, Col {cursor.column}
                </span>
                <span>{selection ? `${selection.length.toLocaleString()} selected` : "No selection"}</span>
                <span>{editorValue.length.toLocaleString()} characters</span>
                <span>{editorValue ? editorValue.split("\n").length.toLocaleString() : 0} lines</span>
                <span className="hidden sm:inline">Updated {relativeTime(activeFile.updatedAt)}</span>
              </>
            ) : (
              <span>No file open</span>
            )}
            <span className="ml-auto hidden md:inline">
              {files.length}/{limits.maxFiles} files
              {demoMode ? " · demo model" : ""}
            </span>
          </div>
        </section>

        {/* Right panel — both views stay mounted so state survives a switch. */}
        <aside
          className={`${
            mobileTab === "assistant" || mobileTab === "preview" ? "flex" : "hidden"
          } w-full min-w-0 shrink-0 flex-col border-l border-border lg:flex lg:w-[380px]`}
        >
          <div className={`${(mobileTab === "preview" ? "preview" : rightView) === "assistant" ? "flex" : "hidden"} h-full min-h-0 flex-col`}>
            <AssistantPanel
              projectId={project.id}
              projectName={project.name}
              files={files}
              context={{
                openFile: activeFile
                  ? { path: activeFile.path, content: editorValue, language: activeFile.language }
                  : null,
                selection,
                includeProjectFiles,
              }}
              conversationId={sessionId}
              onConversationCreated={(id) => setSessionId(id || null)}
              onApply={handleApply}
              onIncludeProjectFilesChange={(value) => {
                setIncludeProjectFiles(value);
                log("info", "context", value ? "all project files are now sent to the model" : "only the open file is sent");
              }}
              models={models}
              defaultModel={defaultModel}
            />
          </div>
          <div className={`${(mobileTab === "preview" ? "preview" : rightView) === "preview" ? "flex" : "hidden"} h-full min-h-0 flex-col`}>
            <PreviewPanel
              projectId={project.id}
              status={preview}
              fileCount={files.length}
              entryCandidates={entryCandidates}
              refreshKey={previewKey}
            />
          </div>
        </aside>
      </div>

      {/* ------------------------------------------------- activity drawer --- */}
      <div
        className={`${
          activityOpen || mobileTab === "activity" ? "flex" : "hidden"
        } h-[220px] shrink-0 flex-col border-t border-border`}
      >
        <TerminalPanel
          entries={entries}
          files={files}
          projectName={project.name}
          onClear={() => {
            setEntries([]);
            log("info", "log cleared", "activity log emptied");
          }}
        />
      </div>

      {/* ----------------------------------------------------- mobile tabs --- */}
      <nav className="flex shrink-0 items-stretch border-t border-border bg-surface lg:hidden" aria-label="Code Studio panels">
        {(
          [
            { id: "code", label: "Code", icon: <IconCode className="h-4 w-4" /> },
            { id: "preview", label: "Preview", icon: <IconEye className="h-4 w-4" /> },
            { id: "assistant", label: "Assistant", icon: <IconSparkle className="h-4 w-4" /> },
            { id: "activity", label: "Activity", icon: <IconTerminal className="h-4 w-4" /> },
          ] as { id: MobileTab; label: string; icon: React.ReactNode }[]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setMobileTab(tab.id);
              if (tab.id === "preview") setRightView("preview");
              if (tab.id === "assistant") setRightView("assistant");
            }}
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
              mobileTab === tab.id ? "text-accent-text" : "text-fg-muted"
            }`}
            aria-current={mobileTab === tab.id ? "page" : undefined}
          >
            <span className="relative flex">
              {tab.icon}
              {tab.id === "code" && dirtyIds.size > 0 && (
                <span className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              )}
            </span>
            {tab.label}
          </button>
        ))}
      </nav>

      {/* --------------------------------------------------------- modals --- */}
      <Modal
        open={newFileOpen}
        onClose={() => !newFileBusy && setNewFileOpen(false)}
        title="New file"
        description="Project-relative path. Folders are implied by the path — there is nothing to create separately."
        footer={
          <ModalFooterActions onCancel={() => setNewFileOpen(false)}>
            <Button variant="primary" onClick={() => void createFile()} loading={newFileBusy}>
              Create file
            </Button>
          </ModalFooterActions>
        }
      >
        <div className="space-y-3">
          <Input
            label="Path"
            value={newFilePath}
            onChange={(event) => setNewFilePath(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void createFile();
              }
            }}
            placeholder="src/index.html"
            error={newFileError}
            hint={
              newFilePath.trim()
                ? `Detected language: ${languageForPath(newFilePath.trim())}. ${
                    STARTERS[languageForPath(newFilePath.trim())]
                      ? "A starter template will be inserted — you can delete it."
                      : "The file will start empty."
                  }`
                : "HTML, CSS, JavaScript, TypeScript, JSX, JSON, Markdown, Python and plain text are supported."
            }
            autoFocus
          />
          <p className="text-[12px] text-fg-muted">
            {files.length}/{limits.maxFiles} files used in this project.
          </p>
        </div>
      </Modal>

      <Modal
        open={Boolean(renameTarget)}
        onClose={() => !renameBusy && setRenameTarget(null)}
        title="Rename or move file"
        description="Changing the path moves the file. Its contents, and any assistant history that references the old path, are kept."
        footer={
          <ModalFooterActions onCancel={() => setRenameTarget(null)}>
            <Button variant="primary" onClick={() => void renameFile()} loading={renameBusy}>
              Move file
            </Button>
          </ModalFooterActions>
        }
      >
        <Input
          label="New path"
          value={renamePath}
          onChange={(event) => setRenamePath(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void renameFile();
            }
          }}
          error={renameError}
          hint={renameTarget ? `Currently ${renameTarget.path}` : undefined}
          autoFocus
        />
      </Modal>

      {/* Screen-reader announcement of the assistant context, kept out of the way. */}
      <span className="sr-only" aria-live="polite">
        {activeFile ? `Editing ${activeFile.path}` : "No file open"}
      </span>
    </div>
  );
}

export type { ExplorerFile, PreviewStatusPayload, TerminalEntry };
