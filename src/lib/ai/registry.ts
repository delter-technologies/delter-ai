import "server-only";
import type { AiProvider, ModelInfo, ProviderId, ProviderStatus } from "./types";
import { ProviderError } from "./types";
import { openaiProvider } from "./providers/openai";
import { anthropicProvider } from "./providers/anthropic";
import { openrouterProvider } from "./providers/openrouter";
import { demoProvider } from "./providers/demo";

/**
 * The provider registry — the single place that knows which providers exist.
 *
 * Adding a provider: write it in `providers/`, append it here. Nothing else in
 * Delter AI changes, because the rest of the app only calls `getProvider`,
 * `resolveModel` and `streamChat`.
 */
const PROVIDERS: Record<ProviderId, AiProvider> = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  openrouter: openrouterProvider,
  "delter-demo": demoProvider,
};

/** Order used when picking a default: real providers first, demo last. */
const PROVIDER_ORDER: ProviderId[] = ["openrouter", "openai", "anthropic", "delter-demo"];

export function getProvider(id: string): AiProvider {
  const provider = PROVIDERS[id as ProviderId];
  if (!provider) {
    throw new ProviderError(`Unknown AI provider "${id}".`, { provider: "delter-demo", status: 400 });
  }
  return provider;
}

export function allProviders(): AiProvider[] {
  return Object.values(PROVIDERS);
}

export function providerStatuses(): ProviderStatus[] {
  return PROVIDER_ORDER.map((id) => PROVIDERS[id].status());
}

export function allModels(): ModelInfo[] {
  return PROVIDER_ORDER.flatMap((id) => PROVIDERS[id].models());
}

/** Models that can actually be called right now, given the configured keys. */
export function availableModels(): ModelInfo[] {
  return allModels().filter((model) => PROVIDERS[model.provider].isConfigured());
}

export function findModel(modelId: string | null | undefined): ModelInfo | undefined {
  if (!modelId) return undefined;
  return allModels().find((m) => m.id === modelId);
}

/**
 * Decide which model serves a request.
 *
 * Precedence:
 *   1. The requested model, if it exists AND its provider is configured.
 *   2. The user's saved default, on the same conditions.
 *   3. The first model of the first configured real provider.
 *   4. The offline demo provider — which always says so out loud.
 *
 * This is what keeps a stale `defaultModel` in the database (say a key was
 * removed) from turning into a hard failure.
 */
export function resolveModel(
  requested: string | null | undefined,
  userDefault: string | null | undefined,
): { model: ModelInfo; provider: AiProvider; fellBack: boolean; reason?: string } {
  const candidates: { id: string | null | undefined; why: string }[] = [
    { id: requested, why: "the model selected for this request" },
    { id: userDefault, why: "your saved default model" },
  ];

  // When the caller asked for nothing specific, whatever this server picks is
  // the intended answer — not a fallback. Reporting it as one would warn the
  // user (on every message) about a substitution that never happened.
  const askedForSomething = Boolean(requested) || Boolean(userDefault);

  for (const candidate of candidates) {
    if (!candidate.id) continue;
    const model = findModel(candidate.id);
    if (!model) continue;
    const provider = PROVIDERS[model.provider];
    if (provider.isConfigured()) {
      return { model, provider, fellBack: false };
    }
  }

  for (const id of PROVIDER_ORDER) {
    if (id === "delter-demo") continue;
    const provider = PROVIDERS[id];
    if (!provider.isConfigured()) continue;
    const model = provider.models().find((m) => m.capabilities.chat);
    if (model) {
      if (!askedForSomething) return { model, provider, fellBack: false };
      return {
        model,
        provider,
        fellBack: true,
        reason: `${requested ?? userDefault} is not available on this server, so Delter AI used ${model.label} instead.`,
      };
    }
  }

  const demoModel = demoProvider.models()[0];
  return {
    model: demoModel,
    provider: demoProvider,
    // Demo mode is announced on its own (`demo: true`), so it only counts as a
    // fallback when a real model was actually asked for.
    fellBack: askedForSomething,
    reason:
      "No AI provider key is configured on this server, so Delter AI answered in offline demo mode. Add a key to .env for live responses.",
  };
}

export type { AiProvider, ModelInfo, ProviderId, ProviderStatus };
export { ProviderError };
