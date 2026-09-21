import "server-only";

import type { AiProvider, ModelInfo, ProviderRequest, StreamChunk } from "../types";
import { ProviderError } from "../types";
import { parseSse, readJsonError } from "../errors";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * OpenRouter speaks the OpenAI wire format, so this provider shares the parsing
 * shape while adding the attribution headers OpenRouter requests and a catalogue
 * of models reachable through a single key.
 */
const MODELS: ModelInfo[] = [
  {
    id: "openrouter/auto",
    provider: "openrouter",
    label: "Auto (best available)",
    description: "OpenRouter picks a capable model for the request.",
    capabilities: { chat: true, streaming: true, images: false, imageInput: false },
    requiresKey: true,
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    provider: "openrouter",
    label: "Claude Sonnet 4.5",
    description: "Strong reasoning and code, via OpenRouter.",
    capabilities: { chat: true, streaming: true, images: false, imageInput: true, contextWindow: 200_000 },
    requiresKey: true,
  },
  {
    id: "openai/gpt-4o-mini",
    provider: "openrouter",
    label: "GPT-4o mini",
    description: "Fast and inexpensive, via OpenRouter.",
    capabilities: { chat: true, streaming: true, images: false, imageInput: true, contextWindow: 128_000 },
    requiresKey: true,
  },
  {
    id: "google/gemini-2.5-flash",
    provider: "openrouter",
    label: "Gemini 2.5 Flash",
    description: "Very large context, quick turnaround.",
    capabilities: { chat: true, streaming: true, images: false, imageInput: true, contextWindow: 1_000_000 },
    requiresKey: true,
  },
  {
    id: "deepseek/deepseek-chat-v3.1",
    provider: "openrouter",
    label: "DeepSeek V3.1",
    description: "Cost-efficient coding model.",
    capabilities: { chat: true, streaming: true, images: false, imageInput: false, contextWindow: 128_000 },
    requiresKey: true,
  },
];

export const openrouterProvider: AiProvider = {
  id: "openrouter",
  label: "OpenRouter",

  isConfigured() {
    return Boolean(process.env.OPENROUTER_API_KEY);
  },

  status() {
    return {
      id: "openrouter",
      label: "OpenRouter",
      configured: this.isConfigured(),
      reason: this.isConfigured() ? undefined : "OPENROUTER_API_KEY is not set on the server.",
    };
  },

  models() {
    return MODELS;
  },

  async *stream(request: ProviderRequest): AsyncGenerator<StreamChunk> {
    if (!this.isConfigured()) {
      throw new ProviderError("OpenRouter is not configured on this server.", { provider: "openrouter", status: 503 });
    }

    const messages = [
      ...(request.system ? [{ role: "system" as const, content: request.system }] : []),
      ...request.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": process.env.OPENROUTER_APP_URL || "https://delter.ai",
        "X-Title": process.env.OPENROUTER_APP_NAME || "Delter AI",
      },
      body: JSON.stringify({
        model: request.model,
        messages,
        stream: true,
        usage: { include: true },
        ...(typeof request.temperature === "number" ? { temperature: request.temperature } : {}),
        ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
      }),
      signal: request.signal,
    });

    if (!res.ok || !res.body) {
      const detail = await readJsonError(res);
      throw new ProviderError(detail ?? `OpenRouter responded with HTTP ${res.status}.`, {
        provider: "openrouter",
        status: res.status,
        retryable: res.status === 429 || res.status >= 500,
      });
    }

    // A reasoning model (OpenRouter's `auto` picks them freely) can burn the
    // whole output budget thinking and emit only `delta.reasoning`, never
    // `delta.content`. Yielding an empty success there would leave the user
    // staring at a blank assistant message, so it is surfaced as an error.
    let emittedContent = false;
    let sawReasoning = false;

    for await (const frame of parseSse(res.body, request.signal)) {
      if (frame.data.trim() === "[DONE]") {
        if (!emittedContent && sawReasoning) {
          throw new ProviderError(
            "The model OpenRouter chose spent its entire output budget on internal reasoning and returned no visible text. Retry — it usually picks a different model — or choose a specific model instead of Auto.",
            { provider: "openrouter", code: "reasoning_budget_exhausted", retryable: true },
          );
        }
        yield { type: "done" };
        return;
      }
      let json: any;
      try {
        json = JSON.parse(frame.data);
      } catch {
        continue;
      }

      const reasoning = json?.choices?.[0]?.delta?.reasoning;
      if (typeof reasoning === "string" && reasoning.length) sawReasoning = true;

      const delta = json?.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length) {
        emittedContent = true;
        yield { type: "delta", text: delta };
      }

      if (json?.usage) {
        yield {
          type: "usage",
          usage: {
            inputTokens: json.usage.prompt_tokens ?? undefined,
            outputTokens: json.usage.completion_tokens ?? undefined,
            totalTokens: json.usage.total_tokens ?? undefined,
          },
        };
      }

      const finish = json?.choices?.[0]?.finish_reason;
      if (finish) {
        if (finish === "length" && !emittedContent && sawReasoning) {
          throw new ProviderError(
            "The model OpenRouter chose spent its entire output budget on internal reasoning and returned no visible text. Retry — it usually picks a different model — or choose a specific model instead of Auto.",
            { provider: "openrouter", code: "reasoning_budget_exhausted", retryable: true },
          );
        }
        yield { type: "done", finishReason: finish };
      }
    }
  },
};
