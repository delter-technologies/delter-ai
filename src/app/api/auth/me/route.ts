import { getSession } from "@/lib/auth";
import { handleRoute, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { providerStatuses } from "@/lib/ai/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me
 *
 * The single source of truth for "who am I" on the client. Returns the user,
 * whether onboarding is complete, and whether any AI provider is configured —
 * the UI uses that to label demo mode honestly.
 */
export const GET = handleRoute(async () => {
  const session = await getSession();
  if (!session) return ok({ user: null, onboarded: false, providers: providerStatuses() });

  const counts = await prisma.$transaction([
    prisma.project.count({ where: { userId: session.user.id, archivedAt: null } }),
    prisma.conversation.count({ where: { userId: session.user.id } }),
    prisma.fileAsset.count({ where: { userId: session.user.id } }),
  ]);

  return ok({
    user: session.user,
    onboarded: Boolean(session.user.onboardedAt),
    providers: providerStatuses(),
    anyProviderConfigured: providerStatuses().some((p) => p.configured && p.id !== "delter-demo"),
    counts: { projects: counts[0], conversations: counts[1], files: counts[2] },
  });
});
