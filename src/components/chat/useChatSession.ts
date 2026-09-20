"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { startChatStream, type StreamMeta, type ChatRequestPayload } from "@/lib/client/chat-stream";
import { useToast } from "@/components/system/ToastProvider";

/**
 * Chat session state.
 *
 * Owns the lifecycle of one conversation: loading persisted history, streaming a
 * response, retrying a failed turn, stopping mid-generation, and reporting which
 * provider actually answered. Every state transition here is driven by something
 * real — a server event or a database write — so the UI never shows a spinner for
 * work that is not happening.
 */

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  error: string | null;
  provider: string | null;
  model: string | null;
  pending: boolean;
  totalTokens: number | null;
  durationMs: number | null;
  createdAt: string;
  /** True for the optimistic message the client adds before the server confirms it. */
  local?: boolean;
};

export type AttachedFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  sizeLabel?: string;
  extractable: boolean;
};

export type SessionStatus =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "load-error"; message: string }
  | { state: "streaming"; meta: StreamMeta | null }
  | { state: "error"; message: string; retryable: boolean; messageId: string | null };

export function useChatSession({
  conversationId,
  projectId,
  kind = "chat",
  onConversationCreated,
  onResponseComplete,
}: {
  conversationId: string | null;
  projectId: string | null;
  kind?: "chat" | "code";
  /** Fired when a new conversation row is created by the first message. */
  onConversationCreated?: (id: string) => void;
  /** Fired after a response finishes so the caller can refresh lists/titles. */
  onResponseComplete?: (info: { conversationId: string; needsTitle: boolean; failed: boolean }) => void;
}) {
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [attached, setAttached] = useState<AttachedFile[]>([]);
  const [status, setStatus] = useState<SessionStatus>({ state: "idle" });
  const [activeConversationId, setActiveConversationId] = useState<string | null>(conversationId);
  const [activeMeta, setActiveMeta] = useState<StreamMeta | null>(null);

  const streamRef = useRef<{ stop: () => void } | null>(null);
  const bufferRef = useRef("");
  const assistantIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      streamRef.current?.stop();
    };
  }, []);

  /* ------------------------------------------------------- load history --- */

  const load = useCallback(
    async (id: string | null) => {
      streamRef.current?.stop();
      streamRef.current = null;
      bufferRef.current = "";
      assistantIdRef.current = null;
      setActiveMeta(null);

      if (!id) {
        setMessages([]);
        setAttached([]);
        setStatus({ state: "idle" });
        setActiveConversationId(null);
        return;
      }

      setStatus({ state: "loading" });
      setActiveConversationId(id);

      try {
        const data = await api.get<{
          conversation: { id: string; attachedFiles: AttachedFile[] };
          messages: ChatMessage[];
        }>(`/api/conversations/${id}`);

        if (!mountedRef.current) return;
        setMessages(data.messages);
        setAttached(data.conversation.attachedFiles ?? []);
        setStatus({ state: "idle" });
      } catch (error) {
        if (!mountedRef.current) return;
        setStatus({
          state: "load-error",
          message: errorMessage(error, "Delter AI could not load this conversation."),
        });
      }
    },
    [],
  );

  useEffect(() => {
    load(conversationId);
  }, [conversationId, load]);

  /* ------------------------------------------------------------- send --- */

  const send = useCallback(
    async (options: {
      content: string;
      model?: string | null;
      fileIds?: string[];
      retryMessageId?: string | null;
      code?: ChatRequestPayload["code"];
    }) => {
      const content = options.content.trim();
      const isRetry = Boolean(options.retryMessageId);

      if (!isRetry && !content) {
        toast.warning("Type a message first");
        return;
      }

      // Optimistically show the user's turn so the UI responds immediately. The
      // server is still the source of truth; a reload replaces this row.
      if (!isRetry) {
        setMessages((current) => [
          ...current,
          {
            id: `local_${Date.now()}`,
            role: "user",
            content,
            error: null,
            provider: null,
            model: options.model ?? null,
            pending: false,
            totalTokens: null,
            durationMs: null,
            createdAt: new Date().toISOString(),
            local: true,
          },
        ]);
      } else {
        // Retrying: drop the failed assistant turn locally, matching the server.
        setMessages((current) => current.filter((message) => message.id !== options.retryMessageId));
      }

      const placeholderId = `pending_${Date.now()}`;
      setMessages((current) => [
        ...current,
        {
          id: placeholderId,
          role: "assistant",
          content: "",
          error: null,
          provider: null,
          model: options.model ?? null,
          pending: true,
          totalTokens: null,
          durationMs: null,
          createdAt: new Date().toISOString(),
          local: true,
        },
      ]);

      bufferRef.current = "";
      assistantIdRef.current = null;
      setStatus({ state: "streaming", meta: null });

      const handle = startChatStream(
        {
          conversationId: activeConversationId,
          projectId,
          kind,
          content: content || " ",
          model: options.model ?? null,
          fileIds: options.fileIds ?? [],
          retryMessageId: options.retryMessageId ?? null,
          code: options.code,
        },
        {
          onMeta: (meta) => {
            setActiveMeta(meta);
            setStatus({ state: "streaming", meta });
            assistantIdRef.current = meta.messageId;

            setMessages((current) =>
              current.map((message) =>
                message.id === placeholderId
                  ? { ...message, id: meta.messageId, provider: meta.provider, model: meta.model }
                  : // Replace the optimistic user row with the persisted one.
                    message.local && message.role === "user"
                    ? { ...message, id: meta.userMessageId, local: false }
                    : message,
              ),
            );

            if (!activeConversationId && meta.conversationId) {
              setActiveConversationId(meta.conversationId);
              onConversationCreated?.(meta.conversationId);
            }

            if (meta.fallback && meta.fallbackReason) {
              // Tell the user which model actually answered, once per response.
              toast.info(
                meta.demo ? "Answered in offline demo mode" : "Used a different model",
                meta.fallbackReason,
              );
            }
          },

          onDelta: (text) => {
            bufferRef.current += text;
            const snapshot = bufferRef.current;
            setMessages((current) =>
              current.map((message) =>
                message.id === (assistantIdRef.current ?? placeholderId) ? { ...message, content: snapshot } : message,
              ),
            );
          },

          onDone: (done) => {
            const id = assistantIdRef.current ?? placeholderId;
            setMessages((current) =>
              current.map((message) =>
                message.id === id
                  ? {
                      ...message,
                      content: done.text || message.content,
                      pending: false,
                      local: false,
                      error: null,
                      totalTokens: done.usage?.totalTokens ?? null,
                      durationMs: done.durationMs,
                      provider: activeMeta?.provider ?? message.provider,
                      model: activeMeta?.model ?? message.model,
                    }
                  : message,
              ),
            );

            if (done.stopped) {
              setStatus({ state: "idle" });
              toast.info("Generation stopped", "What had been generated so far was saved.");
            } else {
              setStatus({ state: "idle" });
            }

            if (done.finishReason === "length") {
              // Cut off by the output cap, not finished. Saying so beats showing a
              // truncated answer as though it were complete — in Code Studio a
              // half-written file is a real hazard, not a cosmetic one.
              toast.warning(
                "Reply cut off at the output limit",
                "The model reached the server's per-request output cap before finishing. Ask it to continue, or raise AI_MAX_OUTPUT_TOKENS in the server .env file.",
              );
            }

            onResponseComplete?.({
              conversationId: done.conversationId,
              needsTitle: done.needsTitle,
              failed: false,
            });
          },

          onError: (error) => {
            const id = assistantIdRef.current ?? placeholderId;
            setMessages((current) =>
              current.map((message) =>
                message.id === id
                  ? {
                      ...message,
                      pending: false,
                      local: false,
                      error: error.message,
                      // Keep any partial text: it was really generated.
                      content: bufferRef.current,
                    }
                  : message,
              ),
            );
            setStatus({ state: "error", message: error.message, retryable: error.retryable, messageId: id });
            toast.error("Unable to generate the response", error.message);
          },
        },
      );

      streamRef.current = handle;

      try {
        await handle.finished;
      } catch (error) {
        if (!mountedRef.current) return;
        const message = errorMessage(error, "Unable to generate the response. Please retry.");
        setMessages((current) =>
          current.map((item) => (item.id === placeholderId ? { ...item, pending: false, error: message } : item)),
        );
        setStatus({ state: "error", message, retryable: true, messageId: placeholderId });
        toast.error("Unable to generate the response", message);
      } finally {
        if (streamRef.current === handle) streamRef.current = null;
      }
    },
    [activeConversationId, activeMeta, kind, onConversationCreated, onResponseComplete, projectId, toast],
  );

  const stop = useCallback(() => {
    streamRef.current?.stop();
    setStatus({ state: "idle" });
  }, []);

  /* -------------------------------------------------------- attachments --- */

  const attachFile = useCallback(
    async (file: AttachedFile) => {
      if (!activeConversationId) {
        // No conversation row yet; it will be created on the first message and
        // the attachment sent with it.
        setAttached((current) => (current.some((item) => item.id === file.id) ? current : [...current, file]));
        return;
      }
      try {
        await api.post(`/api/files/${file.id}/attach`, { conversationId: activeConversationId });
        setAttached((current) => (current.some((item) => item.id === file.id) ? current : [...current, file]));
      } catch (error) {
        toast.error("Could not attach that file", errorMessage(error));
      }
    },
    [activeConversationId, toast],
  );

  const detachFile = useCallback(
    async (fileId: string) => {
      setAttached((current) => current.filter((item) => item.id !== fileId));
      if (!activeConversationId) return;
      try {
        await api.del(`/api/files/${fileId}/attach`, { conversationId: activeConversationId });
      } catch (error) {
        // The chip is already gone locally; tell the user the server disagreed.
        toast.warning("Could not remove that attachment on the server", errorMessage(error));
      }
    },
    [activeConversationId, toast],
  );

  return {
    messages,
    attached,
    status,
    activeConversationId,
    activeMeta,
    isStreaming: status.state === "streaming",
    load,
    send,
    stop,
    attachFile,
    detachFile,
    setMessages,
    clearAttached: () => setAttached([]),
  };
}
