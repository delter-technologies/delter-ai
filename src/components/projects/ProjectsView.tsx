"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Badge, EmptyState, ErrorState } from "@/components/ui/States";
import { Menu, MenuTriggerButton } from "@/components/ui/Menu";
import {
  IconChat,
  IconCode,
  IconFiles,
  IconPencil,
  IconPin,
  IconPlus,
  IconProjects,
  IconSearch,
  IconTrash,
} from "@/components/ui/Icons";
import { relativeTime } from "@/lib/client/format";
import { useConfirm } from "@/components/system/ConfirmProvider";
import { useToast } from "@/components/system/ToastProvider";
import { useProjects } from "@/components/workspace/ProjectProvider";
import type { ProjectSummary } from "@/components/workspace/ProjectProvider";

export type ProjectRow = ProjectSummary & {
  instructions: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TemplateOption = {
  id: string;
  label: string;
  description: string;
  fileCount: number;
  kind: string;
  paths: string[];
};

const KINDS = [
  { id: "general", label: "General" },
  { id: "web", label: "Website" },
  { id: "app", label: "Application" },
  { id: "script", label: "Script" },
  { id: "writing", label: "Writing" },
  { id: "data", label: "Data" },
  { id: "research", label: "Research" },
];

/**
 * Projects list: create, rename, pin, set AI instructions, open in Chat or Code
 * Studio, and delete. Every action reports its real outcome.
 */
export function ProjectsView({
  projects: initialProjects,
  templates,
  openCreateInitially,
}: {
  projects: ProjectRow[];
  templates: TemplateOption[];
  openCreateInitially: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirmDialog = useConfirm().confirm;
  const { setActiveProjectId, setProjects, upsertProject, removeProject } = useProjects();

  const [projects, setLocalProjects] = useState<ProjectRow[]>(initialProjects);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(openCreateInitially);
  const [editing, setEditing] = useState<ProjectRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (openCreateInitially) {
      // Clear ?new=1 so a reload does not reopen the dialog.
      router.replace("/app/projects");
    }
  }, [openCreateInitially, router]);

  const applyList = useCallback(
    (next: ProjectRow[]) => {
      setLocalProjects(next);
      setProjects(
        next.map((project) => ({
          id: project.id,
          name: project.name,
          description: project.description,
          kind: project.kind,
          pinned: project.pinned,
          lastOpenedAt: project.lastOpenedAt,
          updatedAt: project.updatedAt,
          counts: project.counts,
        })),
      );
    },
    [setProjects],
  );

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter(
      (project) =>
        project.name.toLowerCase().includes(needle) || (project.description ?? "").toLowerCase().includes(needle),
    );
  }, [filter, projects]);

  async function onCreate(values: { name: string; description: string; kind: string; template: string; instructions: string }) {
    setBusy(true);
    try {
      const result = await api.post<{ project: ProjectRow; templateApplied: string | null }>("/api/projects", {
        name: values.name,
        description: values.description || null,
        instructions: values.instructions || null,
        kind: values.kind,
        template: values.template || null,
      });

      const created: ProjectRow = {
        ...result.project,
        instructions: values.instructions || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      applyList([created, ...projects]);
      upsertProject({
        id: created.id,
        name: created.name,
        description: created.description,
        kind: created.kind,
        pinned: created.pinned,
        lastOpenedAt: created.lastOpenedAt,
        updatedAt: created.updatedAt,
        counts: created.counts,
      });
      setActiveProjectId(created.id);
      setCreateOpen(false);

      toast.success(
        `Project “${created.name}” created`,
        result.templateApplied ? `${templates.find((t) => t.id === result.templateApplied)?.fileCount ?? 0} starter files added to Code Studio.` : undefined,
      );
      router.push(`/app/projects/${created.id}`);
    } catch (caught) {
      setError(errorMessage(caught));
      toast.error("Could not create that project", errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function onSaveEdit(values: { name: string; description: string; kind: string; instructions: string }) {
    if (!editing) return;
    setBusy(true);
    try {
      await api.patch(`/api/projects/${editing.id}`, {
        name: values.name,
        description: values.description || null,
        kind: values.kind,
        instructions: values.instructions || null,
      });

      const next = projects.map((project) =>
        project.id === editing.id
          ? {
              ...project,
              name: values.name,
              description: values.description || null,
              kind: values.kind,
              instructions: values.instructions || null,
              updatedAt: new Date().toISOString(),
            }
          : project,
      );
      applyList(next);
      upsertProject({
        id: editing.id,
        name: values.name,
        description: values.description || null,
        kind: values.kind,
        pinned: editing.pinned,
        lastOpenedAt: editing.lastOpenedAt,
        updatedAt: new Date().toISOString(),
        counts: editing.counts,
      });
      setEditing(null);
      toast.success("Project updated");
    } catch (caught) {
      toast.error("Could not save those changes", errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function onTogglePin(project: ProjectRow) {
    try {
      await api.patch(`/api/projects/${project.id}`, { pinned: !project.pinned });
      applyList(
        projects
          .map((item) => (item.id === project.id ? { ...item, pinned: !item.pinned } : item))
          .sort((a, b) => Number(b.pinned) - Number(a.pinned)),
      );
      toast.success(project.pinned ? "Unpinned" : "Pinned to the top");
    } catch (caught) {
      toast.error("Could not change that", errorMessage(caught));
    }
  }

  async function onDelete(project: ProjectRow) {
    const confirmed = await confirmDialog({
      title: `Delete “${project.name}”?`,
      description: (
        <>
          This permanently deletes the project along with{" "}
          <strong>
            {project.counts.codeFiles} code file{project.counts.codeFiles === 1 ? "" : "s"}
          </strong>
          ,{" "}
          <strong>
            {project.counts.conversations} conversation{project.counts.conversations === 1 ? "" : "s"}
          </strong>{" "}
          and their messages. Uploaded documents in Files are kept, but lose their project link. This cannot be undone.
        </>
      ),
      confirmLabel: "Delete project",
      tone: "danger",
    });
    if (!confirmed) return;

    try {
      await api.del(`/api/projects/${project.id}`);
      applyList(projects.filter((item) => item.id !== project.id));
      removeProject(project.id);
      toast.success(`Project “${project.name}” deleted`);
    } catch (caught) {
      toast.error("Could not delete that project", errorMessage(caught));
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-5 sm:py-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[21px] font-semibold tracking-[-0.025em] text-fg sm:text-[24px]">Projects</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
            A project holds its conversations, uploaded files and code together, so Delter AI keeps the right context.
          </p>
        </div>
        <Button variant="primary" icon={<IconPlus size={14} />} onClick={() => setCreateOpen(true)}>
          New project
        </Button>
      </div>

      {error ? (
        <div className="mt-4">
          <ErrorState message={error} onRetry={() => setError(null)} />
        </div>
      ) : null}

      {projects.length > 3 ? (
        <div className="relative mt-5 max-w-sm">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-faint" aria-hidden>
            <IconSearch size={14} />
          </span>
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search projects"
            aria-label="Search projects"
            className="h-9 w-full rounded-md border bg-bg pl-8 pr-2.5 text-[13px] text-fg placeholder:text-fg-faint focus:outline-none focus-visible:border-[var(--accent)]"
            style={{ borderColor: "var(--border)" }}
          />
        </div>
      ) : null}

      <div className="mt-5">
        {projects.length === 0 ? (
          <EmptyState
            icon={<IconProjects size={20} />}
            title="No projects yet"
            description="Create one and Delter AI will keep its conversations, files and code together. Starting from a template gives you working files immediately."
            action={
              <Button variant="primary" icon={<IconPlus size={14} />} onClick={() => setCreateOpen(true)}>
                Create your first project
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            compact
            icon={<IconSearch size={18} />}
            title={`No project matches “${filter}”`}
            description="Try a different name, or clear the search."
            action={
              <Button size="sm" variant="secondary" onClick={() => setFilter("")}>
                Clear search
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {visible.map((project) => (
              <li
                key={project.id}
                className="group relative flex flex-col rounded-lg border bg-surface p-3.5 transition-colors hover:bg-bg-subtle"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex items-start gap-2">
                  <Link href={`/app/projects/${project.id}`} className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[14px] font-semibold text-fg">{project.name}</span>
                      {project.pinned ? (
                        <span style={{ color: "var(--text-faint)" }} title="Pinned">
                          <IconPin size={12} />
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] text-fg-muted">
                      {KINDS.find((kind) => kind.id === project.kind)?.label ?? project.kind} · opened{" "}
                      {project.lastOpenedAt ? relativeTime(project.lastOpenedAt) : "never"}
                    </span>
                  </Link>

                  <Menu
                    width={200}
                    ariaLabel={`Actions for ${project.name}`}
                    trigger={MenuTriggerButton(`Actions for ${project.name}`)}
                    items={[
                      {
                        key: "open",
                        label: "Open project",
                        icon: <IconProjects size={14} />,
                        onSelect: () => router.push(`/app/projects/${project.id}`),
                      },
                      {
                        key: "code",
                        label: "Open in Code Studio",
                        icon: <IconCode size={14} />,
                        onSelect: () => router.push(`/app/code?project=${project.id}`),
                      },
                      {
                        key: "chat",
                        label: "Chat in this project",
                        icon: <IconChat size={14} />,
                        onSelect: () => {
                          setActiveProjectId(project.id);
                          router.push("/app/chat?new=1");
                        },
                      },
                      { type: "separator", key: "sep1" },
                      {
                        key: "edit",
                        label: "Edit details",
                        icon: <IconPencil size={14} />,
                        onSelect: () => setEditing(project),
                      },
                      {
                        key: "pin",
                        label: project.pinned ? "Unpin" : "Pin to top",
                        icon: <IconPin size={14} />,
                        onSelect: () => onTogglePin(project),
                      },
                      { type: "separator", key: "sep2" },
                      {
                        key: "delete",
                        label: "Delete",
                        icon: <IconTrash size={14} />,
                        tone: "danger",
                        onSelect: () => onDelete(project),
                      },
                    ]}
                  />
                </div>

                {project.description ? (
                  <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-fg-secondary">{project.description}</p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge tone="neutral" title="Source files stored in Code Studio">
                    <IconCode size={11} className="mr-1" />
                    {project.counts.codeFiles}
                  </Badge>
                  <Badge tone="neutral" title="Conversations in this project">
                    <IconChat size={11} className="mr-1" />
                    {project.counts.conversations}
                  </Badge>
                  <Badge tone="neutral" title="Uploaded files linked to this project">
                    <IconFiles size={11} className="mr-1" />
                    {project.counts.files}
                  </Badge>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                  <Link
                    href={`/app/code?project=${project.id}`}
                    className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border text-[12.5px] font-medium text-fg transition-colors hover:bg-bg-muted sm:flex-none sm:px-3"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <IconCode size={13} />
                    Code Studio
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveProjectId(project.id);
                      router.push("/app/chat?new=1");
                    }}
                    className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border text-[12.5px] font-medium text-fg transition-colors hover:bg-bg-muted sm:flex-none sm:px-3"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <IconChat size={13} />
                    Chat
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ProjectFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={onCreate}
        busy={busy}
        templates={templates}
        mode="create"
      />

      <ProjectFormModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSubmit={onSaveEdit}
        busy={busy}
        templates={templates}
        mode="edit"
        initialValues={
          editing
            ? {
                name: editing.name,
                description: editing.description ?? "",
                kind: editing.kind,
                instructions: editing.instructions ?? "",
                template: "",
              }
            : undefined
        }
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ProjectFormModal({
  open,
  onClose,
  onSubmit,
  busy,
  templates,
  mode,
  initialValues,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: { name: string; description: string; kind: string; template: string; instructions: string }) => void | Promise<void>;
  busy: boolean;
  templates: TemplateOption[];
  mode: "create" | "edit";
  initialValues?: { name: string; description: string; kind: string; instructions: string; template: string };
}) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [kind, setKind] = useState(initialValues?.kind ?? "general");
  const [template, setTemplate] = useState(initialValues?.template ?? "");
  const [instructions, setInstructions] = useState(initialValues?.instructions ?? "");
  const [nameError, setNameError] = useState<string | null>(null);

  // Reset the form each time it opens so a cancelled edit does not linger.
  useEffect(() => {
    if (!open) return;
    setName(initialValues?.name ?? "");
    setDescription(initialValues?.description ?? "");
    setKind(initialValues?.kind ?? "general");
    setTemplate(initialValues?.template ?? "");
    setInstructions(initialValues?.instructions ?? "");
    setNameError(null);
  }, [open, initialValues]);

  const selectedTemplate = templates.find((option) => option.id === template);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Give the project a name.");
      return;
    }
    setNameError(null);
    onSubmit({ name: trimmed, description: description.trim(), kind, template, instructions: instructions.trim() });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "create" ? "New project" : "Edit project"}
      description={
        mode === "create"
          ? "A project groups its conversations, files and code. The instructions below are sent to the AI with every conversation in this project."
          : "Changes apply to future AI responses in this project."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy} loadingLabel={mode === "create" ? "Creating…" : "Saving…"}>
            {mode === "create" ? "Create project" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Project name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          autoFocus
          placeholder="e.g. Marketing site"
          error={nameError}
          disabled={busy}
          labelExtra={<span>{name.length}/80</span>}
        />

        <Textarea
          label="Description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          maxLength={500}
          optional
          placeholder="What is this project for?"
          disabled={busy}
          labelExtra={<span>{description.length}/500</span>}
        />

        {mode === "create" ? (
          <Select
            label="Start from"
            value={template}
            onChange={(event) => {
              setTemplate(event.target.value);
              const chosen = templates.find((option) => option.id === event.target.value);
              if (chosen && !kind) setKind(chosen.kind);
              if (chosen && chosen.kind !== "general") setKind(chosen.kind);
            }}
            disabled={busy}
            hint={
              selectedTemplate
                ? `Writes ${selectedTemplate.fileCount} working file${selectedTemplate.fileCount === 1 ? "" : "s"} into Code Studio: ${selectedTemplate.paths.join(", ")}`
                : "A blank project has no files until you create them. Templates write real, working files — not placeholders."
            }
          >
            {templates.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} — {option.description}
              </option>
            ))}
          </Select>
        ) : null}

        <Select
          label="Project type"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          disabled={busy}
          hint="Used to describe the project to the AI and to decide whether Code Studio can preview it."
        >
          {KINDS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>

        <Textarea
          label="Instructions for the AI"
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          rows={4}
          maxLength={4000}
          optional
          placeholder={"e.g. Use TypeScript strict mode. Keep the existing CSS custom properties. Never add new dependencies without asking."}
          disabled={busy}
          labelExtra={<span>{instructions.length}/4000</span>}
          hint="Sent with every conversation in this project. Be specific — this is what stops the AI guessing your conventions."
        />
      </div>
    </Modal>
  );
}
