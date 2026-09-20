"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { Button } from "@/components/ui/Button";
import { Badge, EmptyState } from "@/components/ui/States";
import {
  IconChat,
  IconCode,
  IconFileCode,
  IconFiles,
  IconFolder,
  IconPlus,
  IconProjects,
  IconSparkle,
} from "@/components/ui/Icons";
import { formatDate, formatDateTime, relativeTime } from "@/lib/client/format";
import { useToast } from "@/components/system/ToastProvider";
import { useConfirm } from "@/components/system/ConfirmProvider";
import { useProjects } from "@/components/workspace/ProjectProvider";

/**
 * A single project.
 *
 * The point of this screen is that everything the AI can see about the project is
 * visible here too: description, instructions, conversations, uploaded documents
 * and source files. Nothing about the project's context is hidden from the user.
 */
export function ProjectDetailView({
  project,
  conversations,
  files,
  codeFiles,
}: {
  project: {
    id: string;
    name: string;
    description: string | null;
    instructions: string | null;
    kind: string;
    pinned: boolean;
    createdAt: string;
    updatedAt: string;
    lastOpenedAt: string | null;
  };
  conversations: { id: string; title: string; kind: string; model: string | null; messageCount: number; lastMessageAt: string }[];
  files: { id: string; name: string; mimeType: string; sizeLabel: string; size: number; extractable: boolean; createdAt: string }[];
  codeFiles: { id: string; path: string; language: string; updatedAt: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const confirmDialog = useConfirm().confirm;
  const { setActiveProjectId, removeProject } = useProjects();
  const [deleting, setDeleting] = useState(false);

  const useAsContext = useCallback(() => {
    setActiveProjectId(project.id);
    toast.success(`“${project.name}” is now the workspace context`, "Chat and Code Studio will use it.");
  }, [project.id, project.name, setActiveProjectId, toast]);

  async function onDelete() {
    const confirmed = await confirmDialog({
      title: `Delete “${project.name}”?`,
      description: (
        <>
          This permanently deletes {codeFiles.length} source file{codeFiles.length === 1 ? "" : "s"},{" "}
          {conversations.length} conversation{conversations.length === 1 ? "" : "s"} and their messages. The{" "}
          {files.length} uploaded document{files.length === 1 ? "" : "s"} in Files {files.length === 1 ? "is" : "are"}{" "}
          kept but {files.length === 1 ? "loses" : "lose"} the project link. This cannot be undone.
        </>
      ),
      confirmLabel: "Delete project",
      tone: "danger",
    });
    if (!confirmed) return;

    setDeleting(true);
    try {
      await api.del(`/api/projects/${project.id}`);
      removeProject(project.id);
      toast.success(`Project “${project.name}” deleted`);
      router.push("/app/projects");
    } catch (error) {
      setDeleting(false);
      toast.error("Could not delete that project", errorMessage(error));
    }
  }

  const isEmpty = conversations.length === 0 && files.length === 0 && codeFiles.length === 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-5 sm:py-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link href="/app/projects" className="mb-1.5 inline-flex items-center gap-1 text-[12px] text-fg-muted hover:text-fg">
            <IconProjects size={12} />
            Projects
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[21px] font-semibold tracking-[-0.025em] text-fg sm:text-[24px]">{project.name}</h1>
            {project.pinned ? <Badge tone="neutral">Pinned</Badge> : null}
            <Badge tone="accent">{project.kind}</Badge>
          </div>
          {project.description ? (
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-fg-secondary">{project.description}</p>
          ) : null}
          <p className="mt-1.5 text-[11.5px] text-fg-faint">
            Created {formatDate(project.createdAt)}
            {project.lastOpenedAt ? ` · last opened ${relativeTime(project.lastOpenedAt)}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Button variant="secondary" icon={<IconChat size={14} />} onClick={() => { useAsContext(); router.push("/app/chat?new=1"); }}>
            Chat here
          </Button>
          <Button variant="primary" icon={<IconCode size={14} />} onClick={() => router.push(`/app/code?project=${project.id}`)}>
            Code Studio
          </Button>
        </div>
      </div>

      {/* Instructions the AI receives */}
      <section className="mt-5 rounded-lg border p-3.5" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
        <div className="flex items-center gap-1.5">
          <IconSparkle size={13} className="text-fg-muted" />
          <h2 className="label-caps">What the AI is told about this project</h2>
        </div>
        {project.instructions ? (
          <p className="mt-2 text-[13px] leading-relaxed text-fg-secondary whitespace-pre-wrap">{project.instructions}</p>
        ) : (
          <p className="mt-2 text-[12.5px] leading-relaxed text-fg-muted">
            No instructions yet. Add them and Delter AI will follow your conventions in every conversation here instead of
            guessing.{" "}
            <button type="button" onClick={useAsContext} className="font-medium text-accent-text hover:underline">
              Set this project as context
            </button>{" "}
            then edit it from the Projects list.
          </p>
        )}
        <p className="mt-2 text-[11.5px] text-fg-faint">
          Sent with: project name, type, {codeFiles.length} source file path{codeFiles.length === 1 ? "" : "s"} and any
          files you attach to a conversation.
        </p>
      </section>

      {isEmpty ? (
        <div className="mt-5">
          <EmptyState
            icon={<IconFolder size={20} />}
            title="This project is empty"
            description="Open it in Code Studio to add source files, or start a conversation with this project as context."
            action={
              <Button variant="primary" icon={<IconCode size={14} />} onClick={() => router.push(`/app/code?project=${project.id}`)}>
                Open in Code Studio
              </Button>
            }
            secondaryAction={
              <Button variant="secondary" icon={<IconChat size={14} />} onClick={() => { useAsContext(); router.push("/app/chat?new=1"); }}>
                Start a chat
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          {/* Conversations */}
          <Panel
            title="Conversations"
            count={conversations.length}
            action={
              <Link
                href="/app/chat?new=1"
                onClick={useAsContext}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-fg-secondary transition-colors hover:bg-bg-muted hover:text-fg"
              >
                <IconPlus size={12} />
                New
              </Link>
            }
            empty={
              <p className="px-3 py-5 text-center text-[12.5px] text-fg-muted">
                No conversations in this project yet.
              </p>
            }
          >
            <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
              {conversations.map((conversation) => (
                <li key={conversation.id} style={{ borderColor: "var(--border)" }}>
                  <Link
                    href={conversation.kind === "code" ? `/app/code?project=${project.id}` : `/app/chat/${conversation.id}`}
                    className="flex items-start gap-2 px-3 py-2 transition-colors hover:bg-bg-muted"
                  >
                    <span className="mt-[3px] shrink-0 text-fg-muted" aria-hidden>
                      {conversation.kind === "code" ? <IconCode size={13} /> : <IconChat size={13} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium text-fg">{conversation.title}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-fg-muted">
                        {conversation.messageCount} message{conversation.messageCount === 1 ? "" : "s"} ·{" "}
                        {relativeTime(conversation.lastMessageAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          {/* Uploaded files */}
          <Panel
            title="Files"
            count={files.length}
            action={
              <Link
                href={`/app/files?project=${project.id}&upload=1`}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-fg-secondary transition-colors hover:bg-bg-muted hover:text-fg"
              >
                <IconPlus size={12} />
                Upload
              </Link>
            }
            empty={
              <p className="px-3 py-5 text-center text-[12.5px] text-fg-muted">
                No documents attached to this project.
              </p>
            }
          >
            <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
              {files.map((file) => (
                <li key={file.id} style={{ borderColor: "var(--border)" }}>
                  <Link
                    href={`/app/files?project=${project.id}&file=${file.id}`}
                    className="flex items-start gap-2 px-3 py-2 transition-colors hover:bg-bg-muted"
                  >
                    <span className="mt-[3px] shrink-0 text-fg-muted" aria-hidden>
                      <IconFiles size={13} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium text-fg">{file.name}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-fg-muted">
                        {file.sizeLabel} · {file.extractable ? "readable as AI context" : "not readable as text"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          {/* Source files */}
          <Panel
            title="Source files"
            count={codeFiles.length}
            action={
              <Link
                href={`/app/code?project=${project.id}`}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-fg-secondary transition-colors hover:bg-bg-muted hover:text-fg"
              >
                <IconCode size={12} />
                Edit
              </Link>
            }
            empty={
              <p className="px-3 py-5 text-center text-[12.5px] text-fg-muted">
                No source files yet — Code Studio can create them.
              </p>
            }
          >
            <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
              {codeFiles.map((file) => (
                <li key={file.id} style={{ borderColor: "var(--border)" }}>
                  <Link
                    href={`/app/code?project=${project.id}&file=${encodeURIComponent(file.path)}`}
                    className="flex items-start gap-2 px-3 py-2 transition-colors hover:bg-bg-muted"
                  >
                    <span className="mt-[3px] shrink-0 text-fg-muted" aria-hidden>
                      <IconFileCode size={13} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[12px] text-fg">{file.path}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-fg-muted">
                        {file.language} · edited {formatDateTime(file.updatedAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
        <p className="text-[12px] text-fg-muted">
          Last updated {formatDateTime(project.updatedAt)}
        </p>
        <Button variant="ghost" onClick={onDelete} loading={deleting} loadingLabel="Deleting…" className="text-danger">
          Delete project
        </Button>
      </div>
    </div>
  );
}

function Panel({
  title,
  count,
  action,
  children,
  empty,
}: {
  title: string;
  count: number;
  action?: React.ReactNode;
  children: React.ReactNode;
  empty: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border bg-surface" style={{ borderColor: "var(--border)" }}>
      <header
        className="flex h-9 items-center justify-between gap-2 border-b px-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}
      >
        <h2 className="label-caps">
          {title} <span className="ml-1 text-fg-faint">{count}</span>
        </h2>
        {action}
      </header>
      {count === 0 ? empty : children}
    </section>
  );
}
