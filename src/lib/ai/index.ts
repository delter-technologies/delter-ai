import "server-only";
import type { AiProvider, ChatMessage, ModelInfo, ProviderRequest, StreamChunk, TokenUsage } from "./types";
import { friendlyProviderError } from "./errors";
import { config } from "@/lib/config";

export type StreamChatOptions = {
  provider: AiProvider;
  model: ModelInfo;
  messages: ChatMessage[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  meta?: ProviderRequest["meta"];
  /** Called with each text delta so the route can forward it to the browser. */
  onDelta?: (text: string) => void;
};

export type StreamChatResult = {
  text: string;
  usage: TokenUsage;
  finishReason?: string;
  /** Set when the provider failed; the caller persists it and shows a retry. */
  error?: { message: string; retryable: boolean; status?: number };
  aborted?: boolean;
};

/**
 * Drive any provider and collect the result.
 *
 * The route handler owns transport (SSE to the browser); this owns the provider
 * contract, so chat, Code Studio and later tools all get identical behaviour:
 * deltas, usage capture, abort handling and a human-readable error.
 */
export async function streamChat(options: StreamChatOptions): Promise<StreamChatResult> {
  const { provider, model, messages, system, temperature, maxTokens, signal, meta, onDelta } = options;

  let text = "";
  const usage: TokenUsage = {};

  try {
    // Always send a cap: an unbounded request makes credit-holding providers
  // assume the model's maximum output and refuse (see config.aiMaxOutputTokens).
  const outputCap = maxTokens ?? config.aiMaxOutputTokens;

  for await (const chunk of provider.stream({ model: model.id, messages, system, temperature, maxTokens: outputCap, signal, meta })) {
      switch (chunk.type) {
        case "delta": {
          text += chunk.text;
          onDelta?.(chunk.text);
          break;
        }
        case "usage": {
          if (chunk.usage.inputTokens != null) usage.inputTokens = chunk.usage.inputTokens;
          if (chunk.usage.outputTokens != null) usage.outputTokens = chunk.usage.outputTokens;
          if (chunk.usage.totalTokens != null) usage.totalTokens = chunk.usage.totalTokens;
          break;
        }
        case "done": {
          if (chunk.finishReason) return { text, usage, finishReason: chunk.finishReason };
          break;
        }
      }
    }
    return { text, usage, finishReason: "stop" };
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message)))) {
      // The user pressed Stop. Keep whatever arrived — that is the honest result.
      return { text, usage, aborted: true, finishReason: "aborted" };
    }
    const friendly = friendlyProviderError(error, provider.id);
    return { text, usage, error: friendly };
  }
}

export * from "./types";
export * from "./registry";
export { friendlyProviderError } from "./errors";
