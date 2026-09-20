import { requireApiUser } from "@/lib/auth";
import { handleRoute, ok } from "@/lib/api";
import { allModels, availableModels, providerStatuses, resolveModel } from "@/lib/ai/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ai/models
 *
 * What the model picker renders. It reports configuration state truthfully:
 * a provider with no key is listed as not configured, and `demoActive` tells the
 * UI whether responses will come from the offline demo provider so it can badge
 * every message accordingly.
 *
 * No key material is ever included — only whether one exists.
 */
export const GET = handleRoute(async () => {
  const { user } = await requireApiUser();

  const statuses = providerStatuses();
  const resolution = resolveModel(user.defaultModel, user.defaultModel);

  return ok({
    providers: statuses.map((status) => ({
      id: status.id,
      label: status.label,
      configured: status.configured,
      reason: status.reason ?? null,
      models: allModels().filter((model) => model.provider === status.id),
    })),
    models: allModels(),
    availableModels: availableModels().map((model) => model.id),
    defaultModel: resolution.model.id,
    defaultProvider: resolution.provider.id,
    demoActive: resolution.provider.id === "delter-demo",
    anyRealProvider: statuses.some((status) => status.configured && status.id !== "delter-demo"),
  });
});
