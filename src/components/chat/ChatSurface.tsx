"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, ErrorState, LoadingState, SkeletonRows } from "@/components/ui/States";
import { Menu, MenuTriggerButton } from "@/components/ui/Menu";
import {
  IconChat,
  IconClose,
  IconCode,
  IconPencil,
  IconPlus,
  IconProjects,
  IconSearch,
  IconTrash,
} from "@/components/ui/Icons";
import { relativeTime } from "@/lib/client/format";
import { useToast } from "@/components/system/ToastProvider";
import { useConfirm } from "@/components/system/ConfirmProvider";
import { useProjects } from "@/components/workspace/ProjectProvider";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { useChatSession } from "./useChatSession";
import { FilePicker } from "./FilePicker";

/**
 * The Chat surface.
 *
 * Layout adapts rather than shrinks:
 *   - ≥1280px  history rail + thread side by side
 *   - <1280px  history becomes a slide-over opened from the header
 *
 * Everything here is persisted: conversations, messages, titles, attachments and
 * the model that answered. Reloading the page restores exactly what you saw.
 */

export type ConversationSummary = {
  id: string;
  title: string;
  kind: string;
  projectId: string | null;
  projectName: string | null;
  provider: string | null;
  model: string | null;
  lastMessageAt: string;
  createdAt: string;
  messageCount: number;
};

export function ChatSurface({
  conversationId,
  demoMode,
  models,
  defaultModel,
}: {
  conversationId: string | null;
  demoMode: boolean;
  models: { id: string; label: string; provider: string; available: boolean }[];
  defaultModel: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirmDialog = useConfirm().confirm;
  const { activeProject, projects } = useProjects();

  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [renaming, setRenaming] = useState<ConversationSummary | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [model, setModel] = useState<string | null>(defaultModel);

  const refreshList = useCallback(async () => {
    try {
      const data = await api.get<{ conversations: ConversationSummary[] }>("/api/conversations?kind=chat&limit=100");
      setConversations(data.conversations);
      setListError(null);
    } catch (error) {
      setListError(errorMessage(error, "Delter AI could not load your conversation history."));
    }
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const session = useChatSession({
    conversationId,
    projectId: activeProject?.id ?? null,
    kind: "chat",
    onConversationCreated: (id) => {
      // Move the URL to the real conversation without adding a history entry the
      // back button has to fight through.
      router.replace(`/app/chat/${id}`);
      refreshList();
    },
    onResponseComplete: async ({ conversationId: id, needsTitle, failed }) => {
      if (!failed) refreshList();
      if (needsTitle && id) {
        try {
          const result = await api.post<{ title: string | null }>("/api/ai/title", { conversationId: id });
          if (result.title) refreshList();
        } catch {
          // A missing title is cosmetic; the conversation still exists and works.
        }
      }
    },
  });

  const filtered = useMemo(() => {
    const list = conversations ?? [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (conversation) =>
        conversation.title.toLowerCase().includes(needle) ||
        (conversation.projectName ?? "").toLowerCase().includes(needle),
    );
  }, [conversations, filter]);

  const startNew = useCallback(() => {
    router.push("/app/chat");
    setHistoryOpen(false);
  }, [router]);

  const removeConversation = useCallback(
    async (conversation: ConversationSummary) => {
      const confirmed = await confirmDialog({
        title: `Delete “${conversation.title}”?`,
        description: (
          <>
            This permanently deletes the conversation and its {conversation.messageCount} message
            {conversation.messageCount === 1 ? "" : "s"}. Files and projects it referenced are not deleted.
          </>
        ),
        confirmLabel: "Delete conversation",
        tone: "danger",
      });
      if (!confirmed) return;

      try {
        await api.del(`/api/conversations/${conversation.id}`);
        toast.success("Conversation deleted");
        if (conversation.id === conversationId) router.push("/app/chat");
        refreshList();
      } catch (error) {
        toast.error("Could not delete that conversation", errorMessage(error));
      }
    },
    [confirmDialog, conversationId, refreshList, router, toast],
  );

  const submitRename = useCallback(async () => {
    if (!renaming) return;
    const title = renameValue.trim();
    if (!title) {
      toast.warning("Enter a title", "A conversation title cannot be empty.");
      return;
    }
    setRenameBusy(true);
    try {
      await api.patch(`/api/conversations/${renaming.id}`, { title });
      toast.success("Conversation renamed");
      setRenaming(null);
      refreshList();
    } catch (error) {
      toast.error("Could not rename that conversation", errorMessage(error));
    } finally {
      setRenameBusy(false);
    }
  }, [refreshList, renaming, renameValue, toast]);

  const onCopy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard");
      } catch {
        toast.warning("Could not access the clipboard", "Your browser blocked clipboard access. Select the text and copy it manually.");
      }
    },
    [toast],
  );

  const historyPanel = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b p-2.5" style={{ borderColor: "var(--border)" }}>
        <Button variant="primary" size="sm" block icon={<IconPlus size={14} />} onClick={startNew}>
          New chat
        </Button>
        <div className="relative mt-2">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-faint" aria-hidden>
            <IconSearch size={13} />
          </span>
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter conversations"
            aria-label="Filter conversations"
            className="h-8 w-full rounded-md border bg-bg pl-7 pr-2 text-[12.5px] text-fg placeholder:text-fg-faint focus:outline-none focus-visible:border-[var(--accent)]"
            style={{ borderColor: "var(--border)" }}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {conversations === null ? (
          listError ? (
            <div className="p-1.5">
              <ErrorState compact message={listError} onRetry={refreshList} />
            </div>
          ) : (
            <div className="p-1.5">
              <SkeletonRows rows={6} />
            </div>
          )
        ) : filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12.5px] leading-relaxed text-fg-muted">
            {filter ? `No conversation matches “${filter}”.` : "No conversations yet."}
          </p>
        ) : (
          <ul className="space-y-px">
            {filtered.map((conversation) => {
              const active = conversation.id === conversationId;
              return (
                <li key={conversation.id} className="group relative">
                  <Link
                    href={`/app/chat/${conversation.id}`}
                    onClick={() => setHistoryOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className="flex items-start gap-2 rounded-md py-1.5 pl-2 pr-8 transition-colors"
                    style={active ? { background: "var(--accent-soft)" } : undefined}
                  >
                    <span
                      className="mt-[3px] shrink-0"
                      style={{ color: active ? "var(--accent-text)" : "var(--text-faint)" }}
                      aria-hidden
                    >
                      {conversation.kind === "code" ? <IconCode size={13} /> : <IconChat size={13} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[12.5px] leading-snug"
                        style={{
                          color: active ? "var(--accent-text)" : "var(--text)",
                          fontWeight: active ? 500 : 400,
                        }}
                      >
                        {conversation.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-fg-faint">
                        {conversation.projectName ? `${conversation.projectName} · ` : ""}
                        {relativeTime(conversation.lastMessageAt)}
                      </span>
                    </span>
                  </Link>

                  <span className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <Menu
                      width={190}
                      ariaLabel={`Actions for ${conversation.title}`}
                      trigger={MenuTriggerButton(`Actions for ${conversation.title}`)}
                      items={[
                        {
                          key: "open",
                          label: "Open",
                          icon: <IconChat size={14} />,
                          onSelect: () => router.push(`/app/chat/${conversation.id}`),
                        },
                        {
                          key: "rename",
                          label: "Rename",
                          icon: <IconPencil size={14} />,
                          onSelect: () => {
                            setRenaming(conversation);
                            setRenameValue(conversation.title);
                          },
                        },
                        { type: "separator", key: "sep" },
                        {
                          key: "delete",
                          label: "Delete",
                          icon: <IconTrash size={14} />,
                          tone: "danger",
                          onSelect: () => removeConversation(conversation),
                        },
                      ]}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {activeProject ? (
        <div className="shrink-0 border-t p-2.5" style={{ borderColor: "var(--border)" }}>
          <p className="label-caps mb-1">Project context</p>
          <Link
            href={`/app/projects/${activeProject.id}`}
            className="flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors hover:bg-bg-muted"
            style={{ borderColor: "var(--border)" }}
          >
            <IconProjects size={13} className="shrink-0 text-fg-muted" />
            <span className="min-w-0 flex-1 truncate text-[12px] text-fg">{activeProject.name}</span>
          </Link>
          <p className="mt-1.5 text-[11px] leading-snug text-fg-faint">
            New chats in this session use that project's description, instructions and files.
          </p>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="flex h-full min-h-0">
      {/* Desktop history rail */}
      <div
        className="hidden w-[264px] shrink-0 border-r bg-bg-subtle xl:block"
        style={{ borderColor: "var(--border)" }}
        aria-label="Conversation history"
      >
        {historyPanel}
      </div>

      {/* Mobile / tablet history drawer */}
      {historyOpen ? (
        <div className="fixed inset-0 z-[70] xl:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setHistoryOpen(false)} aria-hidden />
          <div
            className="absolute inset-y-0 left-0 flex w-[85%] max-w-[300px] flex-col border-r bg-bg-subtle shadow-lg"
            style={{ borderColor: "var(--border)" }}
            role="dialog"
            aria-modal="true"
            aria-label="Conversation history"
          >
            <div className="flex h-11 shrink-0 items-center justify-between border-b px-3" style={{ borderColor: "var(--border)" }}>
              <span className="text-[13px] font-semibold text-fg">Conversations</span>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                aria-label="Close conversation history"
                className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg"
              >
                <IconClose size={15} />
              </button>
            </div>
            <div className="min-h-0 flex-1">{historyPanel}</div>
          </div>
        </div>
      ) : null}

      {/* Thread */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b px-2 sm:px-3" style={{ borderColor: "var(--border)" }}>
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            aria-label="Open conversation history"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-bg-muted hover:text-fg xl:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              <path d="M2.5 4h11M2.5 8h11M2.5 12h7" />
            </svg>
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-fg">
              {conversationId
                ? (filtered.find((c) => c.id === conversationId)?.title ??
                  conversations?.find((c) => c.id === conversationId)?.title ??
                  "Conversation")
                : "New chat"}
            </p>
            {activeProject ? (
              <p className="truncate text-[11px] text-fg-muted">in {activeProject.name}</p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <select
              value={model ?? ""}
              onChange={(event) => setModel(event.target.value || null)}
              aria-label="Model"
              title="Model used for the next response"
              className="hidden h-8 max-w-[13rem] rounded-md border bg-bg px-2 text-[12px] text-fg-secondary focus:outline-none focus-visible:border-[var(--accent)] sm:block"
              style={{ borderColor: "var(--border)" }}
            >
              <option value="">Default model</option>
              {models.map((option) => (
                <option key={option.id} value={option.id} disabled={!option.available}>
                  {option.label}
                  {option.available ? "" : " — key required"}
                </option>
              ))}
            </select>

            <Button size="sm" variant="secondary" icon={<IconPlus size={13} />} onClick={startNew}>
              <span className="hidden sm:inline">New</span>
            </Button>
          </div>
        </div>

        {session.status.state === "loading" ? (
          <LoadingState label="Loading conversation…" />
        ) : session.status.state === "load-error" ? (
          <div className="p-4">
            <ErrorState
              title="Could not load this conversation"
              message={session.status.message}
              onRetry={() => session.load(conversationId)}
            />
          </div>
        ) : session.messages.length === 0 ? (
          <ChatEmpty
            hasProject={Boolean(activeProject)}
            projectName={activeProject?.name ?? null}
            projectCount={projects.length}
            onPrompt={(prompt) => session.send({ content: prompt, model })}
            disabled={session.isStreaming}
          />
        ) : (
          <MessageList
            messages={session.messages}
            isStreaming={session.isStreaming}
            demoMode={demoMode}
            onRetry={(messageId) => session.send({ content: "", retryMessageId: messageId, model })}
            onStop={session.stop}
            onCopy={onCopy}
          />
        )}

        <Composer
          onSend={(content) => session.send({ content, model, fileIds: session.attached.map((file) => file.id) })}
          onStop={session.stop}
          isStreaming={session.isStreaming}
          attached={session.attached}
          onDetach={session.detachFile}
          onPickFiles={() => setPickerOpen(true)}
          modelLabel={model ? (models.find((m) => m.id === model)?.label ?? model) : null}
          demoMode={demoMode}
          projectName={activeProject?.name ?? null}
        />
      </div>

      {/* Rename dialog */}
      <Modal
        open={Boolean(renaming)}
        onClose={() => setRenaming(null)}
        title="Rename conversation"
        description="Titles help you find a conversation later."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitRename} loading={renameBusy} loadingLabel="Saving…">
              Save title
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
          <Input
            label="Title"
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            maxLength={120}
            autoFocus
            labelExtra={<span>{renameValue.length}/120</span>}
          />
        </form>
      </Modal>

      <FilePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        projectId={activeProject?.id ?? null}
        alreadyAttached={session.attached.map((file) => file.id)}
        onPick={async (file) => {
          await session.attachFile(file);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

function ChatEmpty({
  hasProject,
  projectName,
  projectCount,
  onPrompt,
  disabled,
}: {
  hasProject: boolean;
  projectName: string | null;
  projectCount: number;
  onPrompt: (prompt: string) => void;
  disabled: boolean;
}) {
  const suggestions = hasProject
    ? [
        `Summarise what ${projectName} contains so far`,
        `What would you improve about ${projectName}?`,
        "Draft the next piece of work for this project",
      ]
    : [
        "Explain what Delter AI can help me with",
        "Help me plan a piece of work step by step",
        "Review some code I paste in",
      ];

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        <EmptyState
          icon={<IconChat size={20} />}
          title={hasProject ? `Chatting in ${projectName}` : "Start a conversation"}
          description={
            hasProject
              ? "Delter AI has this project's description, instructions and files in scope, so follow-ups like “make the header darker” work without pasting code."
              : "Your conversations are saved to your account. Pick a project in the sidebar to give Delter AI context about what you are working on."
          }
        />

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={disabled}
              onClick={() => onPrompt(suggestion)}
              className="rounded-lg border bg-surface p-3 text-left text-[12.5px] leading-snug text-fg-secondary transition-colors hover:bg-bg-muted hover:text-fg disabled:opacity-50"
              style={{ borderColor: "var(--border)" }}
            >
              {suggestion}
            </button>
          ))}
        </div>

        {!hasProject && projectCount > 0 ? (
          <p className="mt-4 text-center text-[12px] text-fg-muted">
            You have {projectCount} project{projectCount === 1 ? "" : "s"}.{" "}
            <Link href="/app/projects" className="font-medium text-accent-text hover:underline">
              Open one for context
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
