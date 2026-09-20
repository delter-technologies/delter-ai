import "server-only";
import { prisma } from "@/lib/db";
import { allModels, availableModels, providerStatuses, resolveModel } from "@/lib/ai/registry";

/**
 * Data the Chat surface needs on first render, loaded once on the server so the
 * thread paints without a client round-trip.
 */
export async function chatPageData(userId: string, userDefaultModel: string | null) {
  const statuses = providerStatuses();
  const available = new Set(availableModels().map((model) => model.id));
  const resolution = resolveModel(userDefaultModel, userDefaultModel);

  const demoMode = resolution.provider.id === "delter-demo";

  const models = allModels().map((model) => ({
    id: model.id,
    label: model.label,
    provider: model.provider,
    providerLabel: statuses.find((status) => status.id === model.provider)?.label ?? model.provider,
    available: available.has(model.id),
    description: model.description ?? null,
  }));

  return {
    models,
    defaultModel: resolution.model.id,
    demoMode,
    providers: statuses,
  };
}

export async function conversationExists(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId, kind: "chat" },
    select: { id: true },
  });
  return Boolean(conversation);
}
