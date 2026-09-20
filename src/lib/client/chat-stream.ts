import { ClientApiError } from "./api";

/**
 * SSE client for `/api/ai/stream`.
 *
 * Written by hand rather than using EventSource because the request must be a
 * POST with a JSON body and must be cancellable — both things EventSource
 * cannot do.
 */

export type StreamMeta = {
  conversationId: string;
  messageId: string;
  userMessageId: string;
  provider: string;
  providerLabel: string;
  model: string;
  modelLabel: string;
  demo: boolean;
  fallback: boolean;
  fallbackReason: string | null;
  needsTitle: boolean;
  retry: boolean;
};

export type StreamDone = {
  messageId: string;
  conversationId: string;
  text: string;
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  finishReason?: string;
  stopped: boolean;
  durationMs: number;
  demo: boolean;
  needsTitle: boolean;
};

export type StreamErrorPayload = {
  messageId: string;
  message: string;
  retryable: boolean;
  partial: boolean;
  demo: boolean;
};

export type ChatRequestPayload = {
  conversationId?: string | null;
  projectId?: string | null;
  kind?: "chat" | "code";
  content: string;
  model?: string | null;
  fileIds?: string[];
  retryMessageId?: string | null;
  code?: {
    openFilePath?: string | null;
    openFileContent?: string | null;
    openFileLanguage?: string | null;
    selectedCode?: string | null;
    includeProjectFiles?: boolean;
    filePaths?: string[];
  };
};

export type StreamHandlers = {
  onMeta?: (meta: StreamMeta) => void;
  onDelta?: (text: string) => void;
  onDone?: (done: StreamDone) => void;
  onError?: (error: StreamErrorPayload) => void;
};

export type StreamHandle = {
  /** The in-flight request; resolves once the stream closes. */
  finished: Promise<void>;
  /** User pressed Stop: aborts the request and keeps whatever arrived. */
  stop: () => void;
};

export function startChatStream(payload: ChatRequestPayload, handlers: StreamHandlers, signal?: AbortSignal): StreamHandle {
  const controller = new AbortController();
  const combinedAbort = () => controller.abort();
  signal?.addEventListener("abort", combinedAbort);

  const finished = (async () => {
    let response: Response;
    try {
      response = await fetch("/api/ai/stream", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify(payload),
        signal: controller.signal,
        credentials: "same-origin",
        cache: "no-store",
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      throw new ClientApiError(0, "Delter AI could not reach the server to start that response. Please retry.");
    }

    if (!response.ok || !response.body) {
      let message = `Unable to generate the response (HTTP ${response.status}). Please retry.`;
      try {
        const payload = (await response.json()) as { error?: { message?: string } };
        if (payload?.error?.message) message = payload.error.message;
      } catch {
        /* body was not JSON; keep the status-based message */
      }
      if (response.status === 401) {
        message = "Your session has ended. Please sign in again to continue this conversation.";
      }
      throw new ClientApiError(response.status, message);
    }

    await readEventStream(response.body, handlers, controller.signal);
  })().finally(() => {
    signal?.removeEventListener("abort", combinedAbort);
  });

  return { finished, stop: combinedAbort };
}

async function readEventStream(body: ReadableStream<Uint8Array>, handlers: StreamHandlers, signal: AbortSignal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawTerminalEvent = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        const parsed = parseFrame(frame);
        if (!parsed) continue;

        switch (parsed.event) {
          case "meta":
            handlers.onMeta?.(parsed.data as StreamMeta);
            break;
          case "delta":
            handlers.onDelta?.((parsed.data as { text: string }).text);
            break;
          case "done":
            sawTerminalEvent = true;
            handlers.onDone?.(parsed.data as StreamDone);
            break;
          case "error":
            sawTerminalEvent = true;
            handlers.onError?.(parsed.data as StreamErrorPayload);
            break;
          default:
            break;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // A stream that ends without `done`/`error` was cut off — say so rather than
  // leaving the UI spinning on a message that will never finish.
  if (!sawTerminalEvent && !signal.aborted) {
    handlers.onError?.({
      messageId: "",
      message: "The response stream ended before Delter AI finished generating. Please retry.",
      retryable: true,
      partial: false,
      demo: false,
    });
  }
}

function parseFrame(frame: string): { event: string; data: unknown } | null {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of frame.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
  }

  if (!dataLines.length) return null;
  try {
    return { event, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
}
