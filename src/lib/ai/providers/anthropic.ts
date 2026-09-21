import "server-only";

import type { AiProvider, ChatMessage, ModelInfo, ProviderRequest, StreamChunk } from "../types";
import { ProviderError } from "../types";
import { parseSse, readJsonError } from "../errors";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const MODELS: ModelInfo[] = [
  {
    id: "claude-sonnet-4-5",
    provider: "anthropic",
    label: "Claude Sonnet 4.5",
    description: "Balanced reasoning and code quality.",
    capabilities: { chat: true, streaming: true, images: false, imageInput: true, contextWindow: 200_000 },
    requiresKey: true,
  },
  {
    id: "claude-opus-4-1",
    provider: "anthropic",
    label: "Claude Opus 4.1",
    description: "Deepest reasoning. Slower and more expensive.",
    capabilities: { chat: true, streaming: true, images: false, imageInput: true, contextWindow: 200_000 },
    requiresKey: true,
  },
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    label: "Claude Haiku 4.5",
    description: "Fastest Claude. Good for quick edits and summaries.",
    capabilities: { chat: true, streaming: true, images: false, imageInput: true, contextWindow: 200_000 },
    requiresKey: true,
  },
];

/**
 * Anthropic requires alternating user/assistant turns and a top-level `system`
 * field rather than a system message. Collapsing consecutive same-role messages
 * keeps long Code Studio sessions valid without dropping content.
 */
function toAnthropicMessages(messages: ChatMessage[]): { role: "user" | "assistant"; content: string }[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    const role = message.role === "assistant" ? "assistant" : "user";
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += `\n\n${message.content}`;
    else out.push({ role, content: message.content });
  }
  // A conversation must start with a user turn.
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

export const anthropicProvider: AiProvider = {
  id: "anthropic",
  label: "Anthropic",

  isConfigured() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  },

  status() {
    return {
      id: "anthropic",
      label: "Anthropic",
      configured: this.isConfigured(),
      reason: this.isConfigured() ? undefined : "ANTHROPIC_API_KEY is not set on the server.",
    };
  },

  models() {
    return MODELS;
  },

  async *stream(request: ProviderRequest): AsyncGenerator<StreamChunk> {
    if (!this.isConfigured()) {
      throw new ProviderError("Anthropic is not configured on this server.", { provider: "anthropic", status: 503 });
    }

    const systemParts = [
      request.system,
      // System-role messages from history are folded in so no instruction is lost.
      ...request.messages.filter((m) => m.role === "system").map((m) => m.content),
    ].filter(Boolean);

    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: request.maxTokens ?? 4096,
        stream: true,
        ...(systemParts.length ? { system: systemParts.join("\n\n") } : {}),
        ...(typeof request.temperature === "number" ? { temperature: request.temperature } : {}),
        messages: toAnthropicMessages(request.messages),
      }),
      signal: request.signal,
    });

    if (!res.ok || !res.body) {
      const detail = await readJsonError(res);
      throw new ProviderError(detail ?? `Anthropic responded with HTTP ${res.status}.`, {
        provider: "anthropic",
        status: res.status,
        retryable: res.status === 429 || res.status >= 500,
      });
    }

    for await (const frame of parseSse(res.body, request.signal)) {
      let json: any;
      try {
        json = JSON.parse(frame.data);
      } catch {
        continue;
      }

      switch (json?.type) {
        case "content_block_delta": {
          const delta = json.delta;
          if (delta?.type === "text_delta" && typeof delta.text === "string" && delta.text.length) {
            yield { type: "delta", text: delta.text };
          }
          break;
        }
        case "message_delta": {
          if (json.usage?.output_tokens != null) {
            yield { type: "usage", usage: { outputTokens: json.usage.output_tokens } };
          }
          if (json.delta?.stop_reason) yield { type: "done", finishReason: json.delta.stop_reason };
          break;
        }
        case "message_start": {
          if (json.message?.usage) {
            yield {
              type: "usage",
              usage: {
                inputTokens: json.message.usage.input_tokens ?? undefined,
                outputTokens: json.message.usage.output_tokens ?? undefined,
              },
            };
          }
          break;
        }
        case "message_stop": {
          yield { type: "done" };
          return;
        }
        case "error": {
          throw new ProviderError(json.error?.message ?? "Anthropic returned a stream error.", {
            provider: "anthropic",
            status: 502,
            retryable: true,
          });
        }
      }
    }
  },
};
