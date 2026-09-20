import { requireApiUser } from "@/lib/auth";
import { handleRoute, ok } from "@/lib/api";
import { usageSummary } from "@/lib/usage";
import { prisma } from "@/lib/db";
import { storageUsageBytes } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/user/usage?days=30
 *
 * Real numbers only. Everything here is aggregated from UsageEvent rows written
 * when work actually happened, plus the bytes currently on disk. No estimates,
 * no invented quotas — and deliberately no billing, which the roadmap places
 * after the product is stable.
 */
export const GET = handleRoute(async (request: Request) => {
  const { user } = await requireApiUser();
  const url = new URL(request.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 30), 1), 90);

  const [summary, diskBytes, projectCount, conversationCount, fileCount, codeFileCount] = await Promise.all([
    usageSummary(user.id, days),
    storageUsageBytes(user.id),
    prisma.project.count({ where: { userId: user.id, archivedAt: null } }),
    prisma.conversation.count({ where: { userId: user.id } }),
    prisma.fileAsset.count({ where: { userId: user.id } }),
    prisma.codeFile.count({ where: { userId: user.id } }),
  ]);

  return ok({
    days,
    ai: {
      requests: summary.requests,
      failedRequests: summary.failedRequests,
      inputTokens: summary.inputTokens,
      outputTokens: summary.outputTokens,
      totalTokens: summary.totalTokens,
      byModel: summary.byModel,
      byDay: summary.byDay,
    },
    storage: {
      uploads: summary.uploads,
      bytesOnDisk: diskBytes,
      bytesRecorded: summary.bytesStored,
      fileCount,
      codeFileCount,
    },
    workspace: { projectCount, conversationCount },
    images: { generations: summary.imageGenerations },
    billing: {
      // Reported explicitly rather than omitted: there is no billing yet.
      enabled: false,
      note: "Usage is recorded, but plans and payments are roadmap step 21 and are not active. Nothing is charged and no limits are enforced yet.",
    },
  });
});
