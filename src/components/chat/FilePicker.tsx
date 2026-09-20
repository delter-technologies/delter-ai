"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import { IconFiles, IconSearch, IconUpload } from "@/components/ui/Icons";
import { useToast } from "@/components/system/ToastProvider";
import type { AttachedFile } from "./useChatSession";

/**
 * File picker.
 *
 * Lets the user choose which of their stored files become context for a
 * conversation, and upload a new one without leaving the flow. Only files Delter
 * AI can actually read as text are offered for context — a binary is listed with
 * its real limitation rather than appearing attachable and then doing nothing.
 */
export function FilePicker({
  open,
  onClose,
  projectId,
  alreadyAttached,
  onPick,
  allowUpload = true,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string | null;
  alreadyAttached: string[];
  onPick: (file: AttachedFile) => void | Promise<void>;
  allowUpload?: boolean;
}) {
  const toast = useToast();
  const [files, setFiles] = useState<AttachedFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [scopeToProject, setScopeToProject] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setFiles(null);
    setError(null);
    try {
      const scoped = projectId && scopeToProject ? `?projectId=${encodeURIComponent(projectId)}` : "";
      const data = await api.get<{ files: (AttachedFile & { sizeLabel: string })[] }>(`/api/files${scoped}`);
      setFiles(data.files);
    } catch (caught) {
      setError(errorMessage(caught, "Delter AI could not load your files."));
    }
  }, [projectId, scopeToProject]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const upload = useCallback(
    async (picked: FileList | null) => {
      if (!picked?.length) return;
      setUploading(true);
      setUploadProgress(`Uploading ${picked.length} file${picked.length === 1 ? "" : "s"}…`);

      const form = new FormData();
      for (const file of Array.from(picked)) form.append("files", file);
      if (projectId && scopeToProject) form.append("projectId", projectId);

      try {
        const result = await api.upload<{
          uploaded: (AttachedFile & { sizeLabel: string })[];
          failures: { name: string; message: string }[];
        }>("/api/files", form);

        if (result.failures.length) {
          // Report each rejection with the server's actual reason.
          result.failures.forEach((failure) => toast.warning(`“${failure.name}” was not uploaded`, failure.message));
        }
        if (result.uploaded.length) {
          toast.success(
            `Uploaded ${result.uploaded.length} file${result.uploaded.length === 1 ? "" : "s"}`,
            result.uploaded.map((file) => file.name).join(", "),
          );
          await load();
        }
      } catch (caught) {
        toast.error("Upload failed", errorMessage(caught));
      } finally {
        setUploading(false);
        setUploadProgress(null);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [load, projectId, scopeToProject, toast],
  );

  const visible = (files ?? []).filter((file) => {
    if (alreadyAttached.includes(file.id)) return false;
    const needle = filter.trim().toLowerCase();
    return !needle || file.name.toLowerCase().includes(needle);
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Attach files as context"
      description="Only files you choose here are sent to the model. Nothing is attached implicitly."
      size="lg"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[10rem] flex-1">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-faint" aria-hidden>
              <IconSearch size={13} />
            </span>
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Search your files"
              aria-label="Search your files"
              className="h-9 w-full rounded-md border bg-bg pl-8 pr-2.5 text-[13px] text-fg placeholder:text-fg-faint focus:outline-none focus-visible:border-[var(--accent)]"
              style={{ borderColor: "var(--border)" }}
            />
          </div>

          {projectId ? (
            <button
              type="button"
              onClick={() => setScopeToProject((value) => !value)}
              aria-pressed={scopeToProject}
              className="h-9 shrink-0 rounded-md border px-2.5 text-[12.5px] font-medium transition-colors"
              style={{
                borderColor: scopeToProject ? "var(--accent)" : "var(--border)",
                background: scopeToProject ? "var(--accent-soft)" : "var(--surface)",
                color: scopeToProject ? "var(--accent-text)" : "var(--text-secondary)",
              }}
            >
              {scopeToProject ? "This project only" : "All my files"}
            </button>
          ) : null}

          {allowUpload ? (
            <>
              <input
                ref={inputRef}
                type="file"
                multiple
                className="sr-only"
                onChange={(event) => upload(event.target.files)}
                aria-label="Upload files"
              />
              <Button
                variant="secondary"
                icon={<IconUpload size={14} />}
                loading={uploading}
                loadingLabel="Uploading…"
                onClick={() => inputRef.current?.click()}
              >
                Upload
              </Button>
            </>
          ) : null}
        </div>

        {uploadProgress ? (
          <p className="rounded-md border px-3 py-2 text-[12.5px] text-fg-secondary" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
            {uploadProgress} The file is written to storage before Delter AI reports it as uploaded.
          </p>
        ) : null}

        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : files === null ? (
          <SkeletonRows rows={4} />
        ) : visible.length === 0 ? (
          <EmptyState
            compact
            icon={<IconFiles size={18} />}
            title={filter ? "No file matches that search" : alreadyAttached.length ? "Every file here is already attached" : "No files yet"}
            description={
              allowUpload
                ? "Upload a document and Delter AI can read it as context. Text-based formats (txt, md, csv, json, code) are read in full; PDFs and images are stored but not readable as text."
                : "There is nothing to attach in this scope."
            }
            action={
              allowUpload ? (
                <Button size="sm" variant="primary" icon={<IconUpload size={13} />} onClick={() => inputRef.current?.click()}>
                  Upload a file
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="max-h-[46vh] space-y-1 overflow-y-auto pr-0.5">
            {visible.map((file) => (
              <li key={file.id}>
                <button
                  type="button"
                  onClick={() => onPick(file)}
                  className="flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors hover:bg-bg-muted"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span className="shrink-0 text-fg-muted" aria-hidden>
                    <IconFiles size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-fg">{file.name}</span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-fg-muted">
                      {file.sizeLabel ?? ""} · {file.mimeType}
                      {file.extractable ? " · readable as text" : " · not readable as text"}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11.5px] font-medium text-accent-text">Attach</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
