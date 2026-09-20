/**
 * Delter AI — provider abstraction.
 *
 * The rest of the application only ever sees these types. It never imports an
 * SDK, never builds a provider-specific request body, and never learns whether
 * a token delta arrived as `choices[0].delta.content` or as an Anthropic
 * `content_block_delta`. Swapping or adding a provider means adding one file in
 * `src/lib/ai/providers/` and registering it — no UI changes.
 *
 * This module is isomorphic-safe (types only) so client components can import
 * the type names without pulling server code into the browser bundle.
 */

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

/** What a given model can actually do, so the UI can disable what is unsupported. */
export type ModelCapabilities = {
  chat: boolean;
  streaming: boolean;
  images: boolean;
  imageInput: boolean;
  /** Approximate context window in tokens, when the provider publishes one. */
  contextWindow?: number;
};

export type ModelInfo = {
  id: string;
  provider: ProviderId;
  label: string;
  description?: string;
  capabilities: ModelCapabilities;
  /** Models the user can only reach by supplying their own key. */
  requiresKey: boolean;
};

export type ProviderId = "openai" | "anthropic" | "openrouter" | "delter-demo";

export type ProviderStatus = {
  id: ProviderId;
  label: string;
  configured: boolean;
  /** Why it is unavailable, phrased for a human. */
  reason?: string;
};

export type ProviderRequest = {
  model: string;
  messages: ChatMessage[];
  /**
   * Instructions that frame the whole request. Kept separate from `messages`
   * because providers place them differently (Anthropic uses a top-level
   * `system` field; OpenAI/OpenRouter use a system message).
   */
  system?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Optional metadata for a file the AI is working on (Code Studio, Website Builder). */
  meta?: Record<string, string | number | boolean | null | undefined>;
};

export type TokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

/** One unit of progress while a response is being produced. */
export type StreamChunk =
  | { type: "delta"; text: string }
  | { type: "usage"; usage: TokenUsage }
  | { type: "done"; finishReason?: string };

export type StreamResult = {
  text: string;
  usage: TokenUsage;
  finishReason?: string;
};

export interface AiProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** Whether a usable credential is present in the environment. */
  isConfigured(): boolean;
  /** Human-readable status for the Settings → AI screen. */
  status(): ProviderStatus;
  models(): ModelInfo[];
  /**
   * Stream a completion. Implementations yield chunks and must surface provider
   * failures as thrown errors — never as a silently truncated response.
   */
  stream(request: ProviderRequest): AsyncGenerator<StreamChunk>;
}

/** A provider failure the user can act on (bad key, quota, model not found…). */
export class ProviderError extends Error {
  readonly provider: ProviderId;
  readonly status?: number;
  readonly code?: string;
  readonly retryable: boolean;
  constructor(
    message: string,
    opts: { provider: ProviderId; status?: number; code?: string; retryable?: boolean } = { provider: "delter-demo" },
  ) {
    super(message);
    this.name = "ProviderError";
    this.provider = opts.provider;
    this.status = opts.status;
    this.code = opts.code;
    this.retryable = opts.retryable ?? false;
  }
}
