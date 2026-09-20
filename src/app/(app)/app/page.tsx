import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { providerStatuses } from "@/lib/ai/registry";
import { usageSummary } from "@/lib/usage";
import { formatBytes } from "@/lib/storage";
import { DashboardView } from "@/components/dashboard/DashboardView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

/**
 * Dashboard.
 *
 * The starting point, and deliberately the only screen with numbers on it — and
 * those numbers are real: request counts, token totals and storage come from
 * UsageEvent rows and files actually on disk. No decorative statistics.
 */
export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/signin");
  if (!session.user.onboardedAt) redirect("/onboarding");

  const { user } = session;

  const [projects, conversations, files, usage, codeFileCount, statuses] = await Promise.all([
    prisma.project.findMany({
      where: { userId: user.id, archivedAt: null },
      orderBy: [{ pinned: "desc" }, { lastOpenedAt: "desc" }, { updatedAt: "desc" }],
      take: 5,
      select: {
        id: true,
        name: true,
        description: true,
        kind: true,
        lastOpenedAt: true,
        _count: { select: { codeFiles: true, conversations: true, files: true } },
      },
    }),
    prisma.conversation.findMany({
      where: { userId: user.id },
      orderBy: { lastMessageAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        kind: true,
        projectId: true,
        model: true,
        lastMessageAt: true,
        project: { select: { name: true } },
        _count: { select: { messages: true } },
      },
    }),
    prisma.fileAsset.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { id: true, name: true, size: true, mimeType: true, createdAt: true, extractable: true },
    }),
    usageSummary(user.id, 30),
    prisma.codeFile.count({ where: { userId: user.id } }),
    Promise.resolve(providerStatuses()),
  ]);

  const isFirstRun = projects.length === 0 && conversations.length === 0 && files.length === 0;
  const demoMode = !statuses.some((status) => status.configured && status.id !== "delter-demo");

  return (
    <DashboardView
      greeting={greetingFor(new Date())}
      displayName={user.displayName || user.name || user.email.split("@")[0]}
      firstRun={isFirstRun}
      demoMode={demoMode}
      unconfiguredProviders={statuses
        .filter((status) => !status.configured && status.id !== "delter-demo")
        .map((status) => ({ id: status.id, label: status.label, reason: status.reason ?? null }))}
      projects={projects.map((project) => ({
        id: project.id,
        name: project.name,
        description: project.description,
        kind: project.kind,
        lastOpenedAt: project.lastOpenedAt?.toISOString() ?? null,
        counts: {
          codeFiles: project._count.codeFiles,
          conversations: project._count.conversations,
          files: project._count.files,
        },
      }))}
      conversations={conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        kind: conversation.kind,
        projectName: conversation.project?.name ?? null,
        model: conversation.model,
        lastMessageAt: conversation.lastMessageAt.toISOString(),
        messageCount: conversation._count.messages,
      }))}
      files={files.map((file) => ({
        id: file.id,
        name: file.name,
        sizeLabel: formatBytes(file.size),
        mimeType: file.mimeType,
        extractable: file.extractable,
        createdAt: file.createdAt.toISOString(),
      }))}
      usage={{
        requests: usage.requests,
        failedRequests: usage.failedRequests,
        totalTokens: usage.totalTokens,
        uploads: usage.uploads,
        codeFiles: codeFileCount,
        byDay: usage.byDay.slice(-14).map((day) => ({ date: day.date, requests: day.requests, totalTokens: day.totalTokens })),
      }}
    />
  );
}

/** Computed on the server so the client render always matches it. */
function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
