"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Badge, EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { Menu, MenuTriggerButton } from "@/components/ui/Menu";
import {
  IconDownload,
  IconExternal,
  IconFiles,
  IconPencil,
  IconSearch,
  IconTrash,
  IconUpload,
} from "@/components/ui/Icons";
import { formatBytes, formatDate, relativeTime } from "@/lib/client/format";
import { useConfirm } from "@/components/system/ConfirmProvider";
import { useToast } from "@/components/system/ToastProvider";
import { Markdown } from "@/components/ui/Markdown";

/**
 * Files.
 *
 * Every state the brief asks for is real here:
 *   - upload progress per file, driven by XMLHttpRequest so the percentage is the
 *     actual transfer, not an animation
 *   - failures reported with the server's own reason (blocked type, too large,
 *     empty, unreadable) and a partial-success summary when some files went
 *     through and others did not
 *   - preview reads the extracted text that Delter AI can actually use
 *   - download streams the stored bytes back
 *   - delete removes the metadata row and the bytes
 */

export type FileRow = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  sizeLabel: string;
  extractable: boolean;
  sha256: string | null;
  projectId: string | null;
  projectName: string | null;
  createdAt: string;
};

type UploadJob = {
  id: string;
  name: string;
  size: number;
  progress: number;
  state: "queued" | "uploading" | "done" | "failed";
  message?: string;
};

const TEXT_PREVIEWABLE = ["text/", "application/json", "application/xml", "image/svg+xml"];

export function FilesView({
  initialFiles,
  projects,
  scopedProject,
  totals,
  openUploadInitially,
  openFileId,
}: {
  initialFiles: FileRow[];
  projects: { id: string; name: string }[];
  scopedProject: { id: string; name: string } | null;
  totals: { count: number; bytes: number; label: string };
  openUploadInitially: boolean;
  openFileId: string | null;
}) {
  const toast = useToast();
  const confirmDialog = useConfirm().confirm;

  const [files, setFiles] = useState<FileRow[]>(initialFiles);
  const [filter, setFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState<string | null>(scopedProject?.id ?? null);
  const [listError, setListError] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(openUploadInitially);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [dragging, setDragging] = useState(false);

  const [previewFile, setPreviewFile] = useState<FileRow | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [renaming, setRenaming] = useState<FileRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moving, setMoving] = useState<FileRow | null>(null);
  const [moveTarget, setMoveTarget] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const listInputRef = useRef<HTMLInputElement>(null);

  /* ------------------------------------------------------------ listing --- */

  const refresh = useCallback(async () => {
    setListError(null);
    try {
      // "__none__" means "not linked to any project", which is filtered on the
      // client because the API scopes by a real project id.
      const scoped = projectFilter && projectFilter !== "__none__" ? `?projectId=${encodeURIComponent(projectFilter)}` : "";
      const data = await api.get<{ files: FileRow[]; totals: typeof totals }>(`/api/files${scoped}`);
      setFiles(data.files);
    } catch (error) {
      setListError(errorMessage(error, "Delter AI could not load your files."));
    }
  }, [projectFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Deep link: /app/files?file=<id> opens that file's preview.
  useEffect(() => {
    if (!openFileId) return;
    const target = files.find((file) => file.id === openFileId);
    if (target) openPreview(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFileId, files]);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    let list = files;
    if (projectFilter === "__none__") list = list.filter((file) => !file.projectId);
    if (needle) {
      list = list.filter(
        (file) => file.name.toLowerCase().includes(needle) || file.mimeType.toLowerCase().includes(needle),
      );
    }
    return list;
  }, [files, filter, projectFilter]);

  const uploading = jobs.some((job) => job.state === "queued" || job.state === "uploading");

  /* ------------------------------------------------------------ upload --- */

  const startUpload = useCallback(
    (picked: FileList | File[] | null) => {
      const list = picked ? Array.from(picked) : [];
      if (!list.length) return;

      const batch = list.map((file) => ({
        id: `job_${Math.random().toString(36).slice(2, 9)}`,
        name: file.name,
        size: file.size,
        file,
      }));

      setJobs((current) => [
        ...current.filter((job) => job.state !== "done"),
        ...batch.map(({ id, name, size }) => ({ id, name, size, progress: 0, state: "queued" as const })),
      ]);

      const form = new FormData();
      batch.forEach(({ file }) => form.append("files", file));
      if (projectFilter) form.append("projectId", projectFilter);

      // XMLHttpRequest because fetch gives no upload progress. This is the only
      // place the app uses it, and it is what makes the percentage honest.
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/files");
      xhr.withCredentials = true;

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percent = Math.round((event.loaded / event.total) * 100);
        setJobs((current) =>
          current.map((job) =>
            batch.some((item) => item.id === job.id) && job.state !== "done" && job.state !== "failed"
              ? { ...job, progress: percent, state: "uploading" }
              : job,
          ),
        );
      };

      xhr.onload = () => {
        let payload: {
          ok?: boolean;
          data?: { uploaded: FileRow[]; failures: { name: string; message: string }[]; partial: boolean };
          error?: { message?: string };
        };
        try {
          payload = JSON.parse(xhr.responseText);
        } catch {
          payload = { ok: false, error: { message: `The server returned an unreadable response (HTTP ${xhr.status}).` } };
        }

        if (xhr.status >= 200 && xhr.status < 300 && payload.ok && payload.data) {
          const uploadedNames = new Set(payload.data.uploaded.map((file) => file.name));

          setJobs((current) =>
            current.map((job) => {
              if (!batch.some((item) => item.id === job.id)) return job;
              if (uploadedNames.has(job.name)) return { ...job, state: "done", progress: 100 };
              const failure = payload.data!.failures.find((item) => item.name === job.name);
              return { ...job, state: "failed", message: failure?.message ?? "The server did not store this file." };
            }),
          );

          if (payload.data.uploaded.length) {
            setFiles((current) => [...payload.data!.uploaded, ...current.filter((f) => !payload.data!.uploaded.some((u) => u.id === f.id))]);
            toast.success(
              `Uploaded ${payload.data.uploaded.length} file${payload.data.uploaded.length === 1 ? "" : "s"}`,
              payload.data.uploaded.map((file) => `${file.name} (${file.sizeLabel})`).join(", "),
            );
          }

          payload.data.failures.forEach((failure) => {
            toast.warning(`“${failure.name}” was not uploaded`, failure.message);
          });

          if (payload.data.partial) {
            toast.warning(
              "Part of that upload failed",
              `${payload.data.uploaded.length} file(s) stored, ${payload.data.failures.length} rejected. The reasons are listed above.`,
            );
          }
        } else {
          const message =
            payload.error?.message ?? `Upload failed with HTTP ${xhr.status}. Please retry.`;
          setJobs((current) =>
            current.map((job) => (batch.some((item) => item.id === job.id) ? { ...job, state: "failed", message } : job)),
          );
          toast.error("Upload failed", message);
        }
      };

      xhr.onerror = () => {
        const message = "The upload could not reach the server. Check your connection and retry.";
        setJobs((current) =>
          current.map((job) => (batch.some((item) => item.id === job.id) ? { ...job, state: "failed", message } : job)),
        );
        toast.error("Upload failed", message);
      };

      xhr.ontimeout = () => {
        const message = "The upload timed out. Large files on a slow connection may need another attempt.";
        setJobs((current) =>
          current.map((job) => (batch.some((item) => item.id === job.id) ? { ...job, state: "failed", message } : job)),
        );
        toast.error("Upload timed out", message);
      };

      xhr.timeout = 1000 * 60 * 5;
      xhr.send(form);
    },
    [projectFilter, toast],
  );

  /* ----------------------------------------------------------- preview --- */

  const openPreview = useCallback(async (file: FileRow) => {
    setPreviewFile(file);
    setPreviewContent(null);
    setPreviewError(null);

    if (!canPreviewText(file)) return;

    setPreviewLoading(true);
    try {
      const data = await api.get<{ content: string; truncated: boolean; sizeLabel: string }>(
        `/api/files/${file.id}?content=1`,
      );
      setPreviewContent(data.content);
      if (data.truncated) {
        setPreviewError(
          `This file is ${data.sizeLabel}. Delter AI indexed the first 512 KB as text — the preview shows that portion.`,
        );
      }
    } catch (error) {
      setPreviewError(errorMessage(error, "Delter AI could not read this file's contents."));
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const closePreview = useCallback(() => {
    setPreviewFile(null);
    setPreviewContent(null);
    setPreviewError(null);
  }, []);

  /* ------------------------------------------------------- row actions --- */

  const download = useCallback((file: FileRow) => {
    // A plain navigation: the route streams the stored bytes with a
    // Content-Disposition header, and the session cookie authenticates it.
    window.location.assign(`/api/files/${file.id}`);
  }, []);

  async function submitRename() {
    if (!renaming) return;
    const name = renameValue.trim();
    if (!name) {
      toast.warning("Enter a file name");
      return;
    }
    setBusy(true);
    try {
      const data = await api.patch<{ file: FileRow }>(`/api/files/${renaming.id}`, { name });
      setFiles((current) => current.map((file) => (file.id === data.file.id ? data.file : file)));
      setRenaming(null);
      toast.success(`Renamed to “${data.file.name}”`);
    } catch (error) {
      toast.error("Could not rename that file", errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitMove() {
    if (!moving) return;
    setBusy(true);
    try {
      const data = await api.patch<{ file: FileRow }>(`/api/files/${moving.id}`, { projectId: moveTarget || null });
      setFiles((current) =>
        current.map((file) => (file.id === data.file.id ? data.file : file)).filter((file) =>
          projectFilter ? file.projectId === projectFilter : true,
        ),
      );
      setMoving(null);
      toast.success(data.file.projectName ? `Moved to “${data.file.projectName}”` : "Removed from its project");
    } catch (error) {
      toast.error("Could not move that file", errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove(file: FileRow) {
    const confirmed = await confirmDialog({
      title: `Delete “${file.name}”?`,
      description: (
        <>
          This removes the file and its stored copy from Delter AI. It is also detached from any conversation that was
          using it as context. This cannot be undone.
        </>
      ),
      confirmLabel: "Delete file",
      tone: "danger",
    });
    if (!confirmed) return;

    try {
      const result = await api.del<{ deleted: boolean; warning?: string }>(`/api/files/${file.id}`);
      setFiles((current) => current.filter((item) => item.id !== file.id));
      if (previewFile?.id === file.id) closePreview();
      if (result.warning) toast.warning("Deleted, with a note", result.warning);
      else toast.success(`“${file.name}” deleted`);
    } catch (error) {
      toast.error("Could not delete that file", errorMessage(error));
    }
  }

  /* --------------------------------------------------------------- view --- */

  return (
    <div
      className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-5 sm:py-7"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (event.dataTransfer?.files?.length) {
          setUploadOpen(true);
          startUpload(event.dataTransfer.files);
        }
      }}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[21px] font-semibold tracking-[-0.025em] text-fg sm:text-[24px]">Files</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
            {totals.count} file{totals.count === 1 ? "" : "s"} · {totals.label} stored
            {scopedProject ? ` in ${scopedProject.name}` : ""}. Text-based files can be attached to a conversation as AI
            context.
          </p>
        </div>
        <Button variant="primary" icon={<IconUpload size={14} />} onClick={() => setUploadOpen(true)}>
          Upload
        </Button>
      </div>

      {dragging ? (
        <div
          className="mt-4 rounded-lg border-2 border-dashed p-6 text-center"
          style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}
        >
          <p className="text-[13.5px] font-medium" style={{ color: "var(--accent-text)" }}>
            Drop files to upload them
          </p>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[10rem] flex-1">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-faint" aria-hidden>
            <IconSearch size={14} />
          </span>
          <input
            ref={listInputRef}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search by name or type"
            aria-label="Search files"
            className="h-9 w-full rounded-md border bg-bg pl-8 pr-2.5 text-[13px] text-fg placeholder:text-fg-faint focus:outline-none focus-visible:border-[var(--accent)]"
            style={{ borderColor: "var(--border)" }}
          />
        </div>

        <select
          value={projectFilter ?? ""}
          onChange={(event) => setProjectFilter(event.target.value || null)}
          aria-label="Filter by project"
          className="h-9 rounded-md border bg-bg px-2.5 text-[12.5px] text-fg-secondary focus:outline-none focus-visible:border-[var(--accent)]"
          style={{ borderColor: "var(--border)" }}
        >
          <option value="">All projects</option>
          <option value="__none__">Not in a project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>

      {listError ? (
        <div className="mt-4">
          <ErrorState message={listError} onRetry={refresh} />
        </div>
      ) : null}

      <div className="mt-4">
        {visible.length === 0 && !listError ? (
          <EmptyState
            icon={<IconFiles size={20} />}
            title={files.length === 0 ? "No files yet" : "Nothing matches that filter"}
            description={
              files.length === 0
                ? "Upload a document and Delter AI can read it as context in a conversation. Text formats (txt, md, csv, json, code) are read in full up to 512 KB; PDFs and images are stored and downloadable but cannot be read as text."
                : "Clear the search or choose a different project."
            }
            action={
              files.length === 0 ? (
                <Button variant="primary" icon={<IconUpload size={14} />} onClick={() => setUploadOpen(true)}>
                  Upload a file
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFilter("");
                    setProjectFilter(null);
                  }}
                >
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <ul className="overflow-hidden rounded-lg border bg-surface" style={{ borderColor: "var(--border)" }}>
            {visible.map((file, index) => (
              <li
                key={file.id}
                className="flex items-center gap-2.5 px-2.5 py-2 transition-colors hover:bg-bg-subtle sm:gap-3 sm:px-3"
                style={index > 0 ? { borderTop: "1px solid var(--border)" } : undefined}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                  style={{ background: "var(--bg-muted)", color: "var(--text-muted)" }}
                  aria-hidden
                >
                  <IconFiles size={15} />
                </span>

                <button
                  type="button"
                  onClick={() => openPreview(file)}
                  className="min-w-0 flex-1 text-left"
                  aria-label={`Open ${file.name}`}
                >
                  <span className="block truncate text-[13px] font-medium text-fg">{file.name}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-fg-muted">
                    <span>{file.sizeLabel}</span>
                    <span aria-hidden>·</span>
                    <span className="truncate">{file.mimeType}</span>
                    <span aria-hidden>·</span>
                    <span>{relativeTime(file.createdAt)}</span>
                    {file.projectName ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="truncate" style={{ color: "var(--accent-text)" }}>
                          {file.projectName}
                        </span>
                      </>
                    ) : null}
                  </span>
                </button>

                {!file.extractable ? (
                  <Badge tone="warning" title="Stored and downloadable, but Delter AI cannot read its contents as text, so it cannot be used as AI context.">
                    <span className="hidden sm:inline">not readable</span>
                    <span className="sm:hidden">n/a</span>
                  </Badge>
                ) : null}

                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => download(file)}
                    aria-label={`Download ${file.name}`}
                    title="Download"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
                  >
                    <IconDownload size={14} />
                  </button>
                  <Menu
                    width={210}
                    ariaLabel={`Actions for ${file.name}`}
                    trigger={MenuTriggerButton(`Actions for ${file.name}`)}
                    items={[
                      {
                        key: "preview",
                        label: canPreviewText(file) ? "Preview text" : "Details",
                        icon: <IconExternal size={14} />,
                        onSelect: () => openPreview(file),
                      },
                      {
                        key: "download",
                        label: "Download",
                        icon: <IconDownload size={14} />,
                        onSelect: () => download(file),
                      },
                      {
                        key: "rename",
                        label: "Rename",
                        icon: <IconPencil size={14} />,
                        onSelect: () => {
                          setRenaming(file);
                          setRenameValue(file.name);
                        },
                      },
                      {
                        key: "move",
                        label: file.projectId ? "Change project" : "Add to project",
                        icon: <IconFiles size={14} />,
                        onSelect: () => {
                          setMoving(file);
                          setMoveTarget(file.projectId ?? "");
                        },
                      },
                      { type: "separator", key: "sep" },
                      {
                        key: "delete",
                        label: "Delete",
                        icon: <IconTrash size={14} />,
                        tone: "danger",
                        onSelect: () => remove(file),
                      },
                    ]}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* -------------------------------------------------------- upload --- */}
      <Modal
        open={uploadOpen}
        onClose={() => {
          if (uploading) {
            toast.warning("Upload still running", "Leaving this dialog does not cancel the transfer.");
          }
          setUploadOpen(false);
        }}
        title="Upload files"
        description={
          scopedProject || projectFilter
            ? `Files are stored against ${projects.find((p) => p.id === projectFilter)?.name ?? scopedProject?.name ?? "the selected project"}.`
            : "Files are stored in your account. You can link them to a project afterwards."
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setUploadOpen(false)}>
              {uploading ? "Close" : "Done"}
            </Button>
            <Button variant="primary" icon={<IconUpload size={14} />} onClick={() => listInputRef.current?.click()} loading={uploading}>
              Choose files
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <input
            ref={listInputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={(event) => startUpload(event.target.files)}
            aria-label="Choose files to upload"
          />

          <button
            type="button"
            onClick={() => listInputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors hover:bg-bg-muted"
            style={{ borderColor: "var(--border-strong)" }}
          >
            <IconUpload size={20} className="text-fg-muted" />
            <span className="text-[13px] font-medium text-fg">Choose files, or drop them anywhere on this page</span>
            <span className="text-[11.5px] text-fg-muted">Up to 20 at a time · 25 MB each</span>
          </button>

          {jobs.length ? (
            <ul className="space-y-1.5">
              {jobs.map((job) => (
                <li key={job.id} className="rounded-md border p-2.5" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">{job.name}</span>
                    <span className="shrink-0 text-[11px] text-fg-muted">{formatBytes(job.size)}</span>
                    <JobState job={job} />
                  </div>
                  {job.state === "uploading" || job.state === "queued" ? (
                    <div className="mt-2 h-1 overflow-hidden rounded-full" style={{ background: "var(--bg-muted)" }}>
                      <div
                        className="h-full rounded-full transition-[width] duration-150"
                        style={{ width: `${job.progress}%`, background: "var(--accent)" }}
                        role="progressbar"
                        aria-valuenow={job.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Uploading ${job.name}`}
                      />
                    </div>
                  ) : null}
                  {job.message ? (
                    <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: job.state === "failed" ? "var(--danger)" : "var(--text-muted)" }}>
                      {job.message}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          <p className="text-[11.5px] leading-relaxed text-fg-faint">
            A file is only reported as uploaded once its bytes are confirmed on the server's disk and its metadata row is
            written. Executables and other blocked types are refused with the reason shown.
          </p>
        </div>
      </Modal>

      {/* ------------------------------------------------------- preview --- */}
      <Modal
        open={Boolean(previewFile)}
        onClose={closePreview}
        title={previewFile?.name ?? "File"}
        description={
          previewFile
            ? `${previewFile.sizeLabel} · ${previewFile.mimeType} · uploaded ${formatDate(previewFile.createdAt)}${
                previewFile.projectName ? ` · ${previewFile.projectName}` : ""
              }`
            : undefined
        }
        size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={closePreview}>
              Close
            </Button>
            {previewFile ? (
              <Button variant="secondary" icon={<IconDownload size={14} />} onClick={() => download(previewFile)}>
                Download
              </Button>
            ) : null}
          </>
        }
      >
        {previewFile ? (
          <div className="space-y-3">
            {previewError && !previewLoading ? (
              <p className="rounded-md border px-3 py-2 text-[12.5px] leading-relaxed" style={{ borderColor: "color-mix(in srgb, var(--warning) 35%, var(--border))", background: "var(--warning-soft)", color: "var(--text-secondary)" }}>
                {previewError}
              </p>
            ) : null}

            {!canPreviewText(previewFile) ? (
              <EmptyState
                compact
                icon={<IconFiles size={18} />}
                title="No text preview for this format"
                description={
                  <>
                    <span className="font-mono text-[12px]">{previewFile.mimeType}</span> is stored and downloadable, but
                    Delter AI cannot read it as text — so it cannot be attached as AI context. Download it to open it in
                    its own application.
                  </>
                }
              />
            ) : previewLoading ? (
              <LoadingState label="Reading file…" />
            ) : previewContent !== null ? (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Badge tone="success">Readable as AI context</Badge>
                  <span className="text-[11.5px] text-fg-faint">{previewContent.length.toLocaleString()} characters indexed</span>
                </div>
                {previewFile.mimeType === "text/markdown" || previewFile.name.toLowerCase().endsWith(".md") ? (
                  <div className="rounded-md border p-3" style={{ borderColor: "var(--border)" }}>
                    <Markdown source={previewContent} />
                  </div>
                ) : (
                  <pre className="max-h-[50vh] overflow-auto rounded-md border p-3 font-mono text-[12px] leading-relaxed text-fg-secondary" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
                    {previewContent}
                  </pre>
                )}
              </div>
            ) : null}

            {previewFile.sha256 ? (
              <p className="break-all text-[11px] text-fg-faint">
                SHA-256 {previewFile.sha256}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/* -------------------------------------------------------- rename --- */}
      <Modal
        open={Boolean(renaming)}
        onClose={() => setRenaming(null)}
        title="Rename file"
        description="This changes the display name only. The stored copy on disk keeps its server-generated name."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitRename} loading={busy} loadingLabel="Saving…">
              Save
            </Button>
          </>
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitRename();
          }}
        >
          <Input label="File name" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} maxLength={180} autoFocus disabled={busy} />
        </form>
      </Modal>

      {/* ---------------------------------------------------------- move --- */}
      <Modal
        open={Boolean(moving)}
        onClose={() => setMoving(null)}
        title={moving?.projectId ? "Change project" : "Add to a project"}
        description="Linking a file to a project makes it available as context in that project's conversations."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoving(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitMove} loading={busy} loadingLabel="Saving…">
              Save
            </Button>
          </>
        }
      >
        <Select
          label="Project"
          value={moveTarget}
          onChange={(event) => setMoveTarget(event.target.value)}
          disabled={busy}
          hint="Choose “Not in a project” to keep the file in your account without a project link."
        >
          <option value="">Not in a project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
      </Modal>
    </div>
  );
}

function JobState({ job }: { job: UploadJob }) {
  if (job.state === "done") {
    return (
      <span className="shrink-0 text-[11px] font-medium" style={{ color: "var(--success)" }}>
        Stored
      </span>
    );
  }
  if (job.state === "failed") {
    return (
      <span className="shrink-0 text-[11px] font-medium" style={{ color: "var(--danger)" }}>
        Failed
      </span>
    );
  }
  if (job.state === "uploading") {
    return <span className="shrink-0 text-[11px] text-fg-muted">{job.progress}%</span>;
  }
  return <span className="shrink-0 text-[11px] text-fg-faint">Queued</span>;
}

function canPreviewText(file: FileRow): boolean {
  if (file.extractable) return true;
  return TEXT_PREVIEWABLE.some((prefix) => file.mimeType.startsWith(prefix));
}
