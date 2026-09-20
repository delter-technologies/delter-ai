import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { handleRoute, ok } from "@/lib/api";
import { usageSummary } from "@/lib/usage";
import { providerStatuses } from "@/lib/ai/registry";
import { formatBytes } from "@/lib/storage";
import { TOOLS } from "@/lib/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard
 *
 * One request fills the dashboard: recent projects, recent conversations, recent
 * files and real usage. Everything is the user's own data, ordered by when they
 * actually last touched it — no decorative statistics.
 */
export const GET = handleRoute(async () => {
  const { user } = await requireApiUser();

  const [projects, conversations, files, usage, codeFileCount, statuses] = await Promise.all([
    prisma.project.findMany({
      where: { userId: user.id, archivedAt: null },
      orderBy: [{ pinned: "desc" }, { lastOpenedAt: "desc" }, { updatedAt: "desc" }],
      take: 6,
      select: {
        id: true,
        name: true,
        description: true,
        kind: true,
        pinned: true,
        lastOpenedAt: true,
        updatedAt: true,
        _count: { select: { codeFiles: true, conversations: true, files: true } },
      },
    }),
    prisma.conversation.findMany({
      where: { userId: user.id },
      orderBy: { lastMessageAt: "desc" },
      take: 6,
      select: {
        id: true,
        title: true,
        kind: true,
        projectId: true,
        model: true,
        lastMessageAt: true,
        project: { select: { id: true, name: true } },
        _count: { select: { messages: true } },
      },
    }),
    prisma.fileAsset.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, size: true, mimeType: true, createdAt: true, projectId: true },
    }),
    usageSummary(user.id, 30),
    prisma.codeFile.count({ where: { userId: user.id } }),
    Promise.resolve(providerStatuses()),
  ]);

  const configuredReal = statuses.filter((status) => status.configured && status.id !== "delter-demo");

  return ok({
    greeting: greetingFor(new Date()),
    displayName: user.displayName || user.name || user.email.split("@")[0],
    onboarded: Boolean(user.onboardedAt),

    recentProjects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      kind: project.kind,
      pinned: project.pinned,
      lastOpenedAt: project.lastOpenedAt,
      counts: {
        codeFiles: project._count.codeFiles,
        conversations: project._count.conversations,
        files: project._count.files,
      },
    })),

    recentConversations: conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      kind: conversation.kind,
      projectId: conversation.projectId,
      projectName: conversation.project?.name ?? null,
      model: conversation.model,
      lastMessageAt: conversation.lastMessageAt,
      messageCount: conversation._count.messages,
    })),

    recentFiles: files.map((file) => ({
      id: file.id,
      name: file.name,
      size: file.size,
      sizeLabel: formatBytes(file.size),
      mimeType: file.mimeType,
      projectId: file.projectId,
      createdAt: file.createdAt,
    })),

    usage: {
      requests: usage.requests,
      failedRequests: usage.failedRequests,
      totalTokens: usage.totalTokens,
      uploads: usage.uploads,
      bytesStored: usage.bytesStored,
      byDay: usage.byDay.slice(-14),
    },

    totals: {
      projects: projects.length,
      conversations: conversations.length,
      files: files.length,
      codeFiles: codeFileCount,
    },

    ai: {
      demoMode: configuredReal.length === 0,
      providers: statuses.map((status) => ({
        id: status.id,
        label: status.label,
        configured: status.configured,
        reason: status.reason ?? null,
      })),
      configuredProviders: configuredReal.map((status) => status.label),
    },

    // Only the tools that genuinely exist are listed as available. The sidebar and
    // dashboard both read this, so a not-yet-built tool can never appear as a
    // working button anywhere in the product.
    tools: TOOLS.map((tool) => ({
      id: tool.id,
      label: tool.label,
      available: tool.available,
      stage: tool.stage,
      href: tool.href,
    })),
  });
});

function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
