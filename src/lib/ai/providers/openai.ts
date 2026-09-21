import "server-only";

import type { AiProvider, ModelInfo, ProviderRequest, StreamChunk } from "../types";
import { ProviderError } from "../types";
import { parseSse, readJsonError } from "../errors";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const MODELS: ModelInfo[] = [
  {
    id: "gpt-4o-mini",
    provider: "openai",
    label: "GPT-4o mini",
    description: "Fast and inexpensive. Good default for everyday work.",
    capabilities: { chat: true, streaming: true, images: false, imageInput: true, contextWindow: 128_000 },
    requiresKey: true,
  },
  {
    id: "gpt-4o",
    provider: "openai",
    label: "GPT-4o",
    description: "Strong all-round model for writing, reasoning and code.",
    capabilities: { chat: true, streaming: true, images: true, imageInput: true, contextWindow: 128_000 },
    requiresKey: true,
  },
  {
    id: "gpt-4.1",
    provider: "openai",
    label: "GPT-4.1",
    description: "Long-context model, well suited to whole-project code work.",
    capabilities: { chat: true, streaming: true, images: false, imageInput: true, contextWindow: 1_000_000 },
    requiresKey: true,
  },
  {
    id: "gpt-image-1",
    provider: "openai",
    label: "GPT Image 1",
    description: "Image generation. Used by Image Studio (roadmap step 7).",
    capabilities: { chat: false, streaming: false, images: true, imageInput: true },
    requiresKey: true,
  },
];

export const openaiProvider: AiProvider = {
  id: "openai",
  label: "OpenAI",

  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY);
  },

  status() {
    return {
      id: "openai",
      label: "OpenAI",
      configured: this.isConfigured(),
      reason: this.isConfigured() ? undefined : "OPENAI_API_KEY is not set on the server.",
    };
  },

  models() {
    return MODELS;
  },

  async *stream(request: ProviderRequest): AsyncGenerator<StreamChunk> {
    if (!this.isConfigured()) {
      throw new ProviderError("OpenAI is not configured on this server.", { provider: "openai", status: 503 });
    }

    const messages = [
      ...(request.system ? [{ role: "system" as const, content: request.system }] : []),
      ...request.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: request.model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        ...(typeof request.temperature === "number" ? { temperature: request.temperature } : {}),
        ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
      }),
      signal: request.signal,
    });

    if (!res.ok || !res.body) {
      const detail = await readJsonError(res);
      throw new ProviderError(detail ?? `OpenAI responded with HTTP ${res.status}.`, {
        provider: "openai",
        status: res.status,
        retryable: res.status === 429 || res.status >= 500,
      });
    }

    for await (const frame of parseSse(res.body, request.signal)) {
      if (frame.data.trim() === "[DONE]") {
        yield { type: "done" };
        return;
      }
      let json: any;
      try {
        json = JSON.parse(frame.data);
      } catch {
        continue;
      }

      const delta = json?.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length) yield { type: "delta", text: delta };

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
      if (finish) yield { type: "done", finishReason: finish };
    }
  },
};
