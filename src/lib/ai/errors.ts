import { ProviderError } from "./types";
import type { ProviderId } from "./types";

/**
 * Turn whatever a provider threw into a sentence a person can act on.
 *
 * The brief is explicit: no "Something went wrong." Every message here names the
 * cause and the next step, and says whether retrying could help.
 */

type FriendlyError = {
  message: string;
  retryable: boolean;
  status?: number;
};

export function providerName(provider: ProviderId): string {
  return provider === "openai"
    ? "OpenAI"
    : provider === "anthropic"
      ? "Anthropic"
      : provider === "openrouter"
        ? "OpenRouter"
        : provider === "delter-demo"
          ? "the offline demo responder"
          : "the AI provider";
}

const BILLING_URL: Record<string, string> = {
  openai: "https://platform.openai.com/settings/organization/billing",
  anthropic: "https://console.anthropic.com/settings/billing",
  openrouter: "https://openrouter.ai/settings/credits",
};

/**
 * Classify by what the provider actually said, not just by its HTTP status.
 *
 * A 400 from Anthropic is usually a malformed or over-long prompt, but it is also
 * what "your credit balance is too low" arrives as; a 429 from OpenAI is usually
 * a rate limit, but it is also what "you have no credits remaining" arrives as.
 * Guessing from the status alone tells the user to retry something that can never
 * succeed, so the provider's own wording is checked first.
 */
const CAUSES = {
  // OpenRouter holds `max_tokens × price` up front, so a small balance can
  // refuse an expensive model even though the account is not out of credit.
  creditHold: /requires more credits|can only afford|fewer max_tokens/i,
  billing: /credit balance|no credits remaining|insufficient[_ ]quota|credit_balance_exhausted|exceeded your current quota|billing|payment method|arrears|purchase credits|add credits/i,
  auth: /invalid api key|incorrect api key|invalid_api_key|api key not found|invalid x-api-key|unauthoriz|authentication_error|permission/i,
  missingModel: /model_not_found|does not exist|no such model|model .*not (found|available)|not authorised to use|access to .*model/i,
  context: /context (length|window)|maximum context|prompt is too long|too many tokens|exceeds .*context|reduce the length/i,
  moderation: /content_policy|content filter|moderation|flagged/i,
  rate: /rate limit|too many requests|overloaded|try again later/i,
};

function classifyByDetail(detail: string, provider: ProviderId): FriendlyError | null {
  const name = providerName(provider);

  if (CAUSES.creditHold.test(detail)) {
    // Mirrors config.aiMaxOutputTokens. Read from the environment directly so
    // this module stays free of Node-only imports.
    const cap = Number(process.env.AI_MAX_OUTPUT_TOKENS) || 2048;
    return {
      message: `${name} pre-authorises credit for the longest reply the model could give, so this request needs more balance than the account holds — even though the actual answer would be short. Add credit at ${
        BILLING_URL[provider] ?? "the provider's billing page"
      }, choose a less expensive model in Settings → Appearance & AI, or lower AI_MAX_OUTPUT_TOKENS in the server .env (currently ${cap}). Retrying unchanged will not help. (${detail})`,
      retryable: false,
    };
  }

  if (CAUSES.billing.test(detail)) {
    const url = BILLING_URL[provider];
    return {
      message: `Your ${name} account has no API credit left, so Delter AI cannot use it. ${
        url ? `Add credit at ${url}, or ` : ""}choose a different model in Settings → Appearance & AI. Retrying will not help until the account has credit. (${detail})`,
      retryable: false,
    };
  }

  if (CAUSES.auth.test(detail)) {
    return {
      message: `The ${name} API key on this server was rejected. Check the key in the server .env file — it may be revoked, expired, or belong to a different organisation. (${detail})`,
      retryable: false,
    };
  }

  if (CAUSES.missingModel.test(detail)) {
    return {
      message: `${name} does not offer that model to this API key. Choose a different model in Settings → Appearance & AI. (${detail})`,
      retryable: false,
    };
  }

  if (CAUSES.context.test(detail)) {
    return {
      message: `That conversation is too long for the selected model. Start a new chat, remove attached files, or pick a model with a larger context window. (${detail})`,
      retryable: false,
    };
  }

  if (CAUSES.moderation.test(detail)) {
    return {
      message: `${name} refused this prompt under its content policy. Rephrase the request or choose another provider. (${detail})`,
      retryable: false,
    };
  }

  if (CAUSES.rate.test(detail)) {
    return {
      message: `${name} is rate limiting Delter AI right now. Wait a moment and retry. (${detail})`,
      retryable: true,
    };
  }

  return null;
}

function describeStatus(status: number, provider: ProviderId): FriendlyError | null {
  const name = providerName(provider);

  switch (status) {
    case 400:
      return {
        message: `${name} rejected the request. This usually means the prompt was too long for the selected model — try a shorter conversation or switch models.`,
        retryable: false,
        status,
      };
    case 401:
    case 403:
      return {
        message: `The ${name} API key is missing or invalid. Add a working key in the server .env file to enable live responses.`,
        retryable: false,
        status,
      };
    case 404:
      return {
        message: `${name} does not recognise that model id. Choose a different model in Settings → AI.`,
        retryable: false,
        status,
      };
    case 413:
      return {
        message: `The conversation is too large for ${name} to accept. Start a new chat or remove attached files.`,
        retryable: false,
        status,
      };
    case 422:
      return {
        message: `${name} could not process that request. Check the prompt and try again.`,
        retryable: false,
        status,
      };
    case 429:
      return {
        message: `${name} is rate limiting Delter AI right now. Wait a moment and retry.`,
        retryable: true,
        status,
      };
    case 500:
    case 502:
    case 503:
    case 504:
      return {
        message: `${name} is having trouble responding. Please retry in a few seconds.`,
        retryable: true,
        status,
      };
    default:
      return null;
  }
}

export function friendlyProviderError(error: unknown, provider: ProviderId): FriendlyError {
  if (error instanceof ProviderError) {
    // 1. What the provider actually said (billing, auth, model, context, rate).
    const classified = classifyByDetail(error.message, provider);
    if (classified) {
      return { ...classified, status: error.status };
    }
    // 2. A status-based description, when the provider gave nothing specific.
    const described = error.status ? describeStatus(error.status, provider) : null;
    // 3. Otherwise pass the provider's own message through rather than a guess.
    return {
      message: described && /responded with HTTP/.test(error.message) ? described.message : (error.message || described?.message || "Unable to generate the response."),
      retryable: error.retryable || Boolean(described?.retryable),
      status: error.status,
    };
  }

  if (error instanceof Error) {
    if (error.name === "AbortError" || /aborted/i.test(error.message)) {
      return { message: "Generation stopped.", retryable: true };
    }
    if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(error.message)) {
      return {
        message: "Delter AI could not reach the AI provider. Check the server's network connection and retry.",
        retryable: true,
      };
    }
    if (/timeout/i.test(error.message)) {
      return { message: "The provider took too long to respond. Please retry.", retryable: true };
    }
    return { message: `Unable to generate the response: ${error.message}`, retryable: true };
  }

  return { message: "Unable to generate the response. Please retry.", retryable: true };
}

/** Parse an SSE stream into JSON payloads plus a terminal `[DONE]` marker. */
export async function* parseSse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<{ event?: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line; tolerate CRLF providers.
      for (let frame = findFrameEnd(buffer); frame !== null; frame = findFrameEnd(buffer)) {
        const rawFrame = buffer.slice(0, frame.start);
        buffer = buffer.slice(frame.end);

        let event: string | undefined;
        const dataLines: string[] = [];
        for (const line of rawFrame.split(/\r?\n/)) {
          if (!line || line.startsWith(":")) continue;
          const colon = line.indexOf(":");
          const field = colon === -1 ? line : line.slice(0, colon);
          let val = colon === -1 ? "" : line.slice(colon + 1);
          if (val.startsWith(" ")) val = val.slice(1);
          if (field === "event") event = val;
          else if (field === "data") dataLines.push(val);
        }
        if (dataLines.length) yield { event, data: dataLines.join("\n") };
      }
    }

    if (buffer.trim()) {
      const dataLines = buffer
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim());
      if (dataLines.length) yield { data: dataLines.join("\n") };
    }
  } finally {
    reader.releaseLock();
  }
}

function findFrameEnd(buffer: string): { start: number; end: number } | null {
  const lf = buffer.indexOf("\n\n");
  const crlf = buffer.indexOf("\r\n\r\n");
  if (lf === -1 && crlf === -1) return null;
  if (crlf !== -1 && (lf === -1 || crlf < lf)) return { start: crlf, end: crlf + 4 };
  return { start: lf, end: lf + 2 };
}

export async function readJsonError(res: Response): Promise<string | null> {
  try {
    const text = await res.text();
    if (!text) return null;
    const parsed = JSON.parse(text);
    return (
      parsed?.error?.message ??
      parsed?.message ??
      parsed?.error?.toString?.() ??
      text.slice(0, 300)
    );
  } catch {
    return null;
  }
}
