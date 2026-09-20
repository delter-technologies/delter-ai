import { requireApiUser, ApiError } from "@/lib/auth";
import { handleRoute, ok } from "@/lib/api";
import { getProvider } from "@/lib/ai/registry";
import { friendlyProviderError } from "@/lib/ai/errors";
import { ProviderError } from "@/lib/ai/types";
import { recordUsage } from "@/lib/usage";
import type { RouteContext } from "@/lib/api";
import type { TokenUsage } from "@/lib/ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

const TEST_TIMEOUT_MS = 25_000;

/**
 * POST /api/ai/providers/:id/test
 *
 * Sends one real, minimal request (≤16 tokens out) to a provider and reports
 * exactly what came back.
 *
 * Why this exists: "an API key is present" and "this provider works" are two
 * different facts. A key can be valid while the account has no credit, or be
 * scoped so that the model cannot be called. Settings shows `configured` from
 * the environment alone, so this button is the only way to tell the difference
 * without sending a real chat message. The result is passed through honestly —
 * including the provider's own error wording and where to fix billing.
 *
 * The call spends real provider credit, so it is recorded as a usage event.
 */
export const POST = handleRoute<Params>(async (_request, context) => {
  const { user } = await requireApiUser();
  const { id } = await context.params;

  let provider;
  try {
    provider = getProvider(id);
  } catch {
    throw new ApiError(404, "That AI provider does not exist.");
  }
  // Pick the cheapest chat-capable model so a connection test costs almost
  // nothing on the user's key.
  const chatModels = provider.models().filter((entry) => entry.capabilities.chat);
  const CHEAP = /(mini|nano|haiku|flash|auto)/i;
  const model = chatModels.find((entry) => CHEAP.test(entry.id)) ?? chatModels[0];

  const base = {
    provider: provider.id,
    label: provider.label,
    /** True only for the built-in offline responder, which is not a language model. */
    demo: provider.id === "delter-demo",
    configured: provider.isConfigured(),
    model: model?.id ?? null,
    modelLabel: model?.label ?? null,
  };

  if (!model) {
    return ok({ ...base, ok: false, message: "That provider has no chat model to test with.", retryable: false, latencyMs: 0 });
  }

  // A missing key is a configuration fact, not a network failure: report it
  // without burning a request.
  if (!provider.isConfigured()) {
    const status = provider.status();
    return ok({
      ...base,
      ok: false,
      message: status.reason ?? `No credential is configured for ${provider.label} on this server.`,
      retryable: false,
      latencyMs: 0,
      tested: false,
    });
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);

  try {
    let reply = "";
    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let finishReason: string | undefined;

    const stream = provider.stream({
      model: model.id,
      system: "Reply with the single word: connected",
      messages: [{ role: "user", content: "Connection test from Delter AI Settings." }],
      temperature: 0,
      // Room to think: reasoning models spend output tokens before they answer,
      // so a tiny cap would produce an empty reply from a healthy provider.
      maxTokens: 256,
      signal: controller.signal,
    });

    for await (const chunk of stream) {
      if (chunk.type === "delta") reply += chunk.text;
      else if (chunk.type === "usage") Object.assign(usage, chunk.usage);
      else if (chunk.type === "done") finishReason = chunk.finishReason;
    }

    const latencyMs = Date.now() - startedAt;
    await recordUsage({
      userId: user.id,
      kind: "ai.provider.test",
      provider: provider.id,
      model: model.id,
      usage,
      status: "success",
    });

    return ok({
      ...base,
      ok: true,
      tested: true,
      latencyMs,
      reply: reply.trim().slice(0, 200),
      note: reply.trim()
        ? undefined
        : "The provider responded, but with no visible text.",
      finishReason: finishReason ?? null,
      tokens: usage.totalTokens ?? 0,
    });
  } catch (error) {
    const latencyMs = Date.now() - startedAt;

    // The provider answered; the model just thought instead of speaking. That is
    // a reachable connection, and calling it a failure would be wrong.
    if (error instanceof ProviderError && error.code === "reasoning_budget_exhausted") {
      await recordUsage({
        userId: user.id,
        kind: "ai.provider.test",
        provider: provider.id,
        model: model.id,
        status: "success",
      });
      return ok({
        ...base,
        ok: true,
        tested: true,
        latencyMs,
        reply: "",
        note: `Reachable in ${latencyMs} ms. The model spent the whole test budget on internal reasoning and returned no visible text — a property of reasoning models, not a connection failure.`,
      });
    }

    const providerError =
      error instanceof ProviderError
        ? error
        : new ProviderError(
            error instanceof Error && error.name === "AbortError"
              ? `No response within ${Math.round(TEST_TIMEOUT_MS / 1000)} seconds.`
              : error instanceof Error
                ? error.message
                : "The provider could not be reached.",
            { provider: provider.id, retryable: true },
          );
    const friendly = friendlyProviderError(providerError, provider.id);

    await recordUsage({
      userId: user.id,
      kind: "ai.provider.test",
      provider: provider.id,
      model: model.id,
      status: "error",
      error: friendly.message,
    });

    return ok({
      ...base,
      ok: false,
      tested: true,
      latencyMs,
      message: friendly.message,
      retryable: friendly.retryable,
      status: providerError.status ?? null,
    });
  } finally {
    clearTimeout(timer);
  }
});
