import "server-only";
import { prisma } from "@/lib/db";
import type { TokenUsage } from "@/lib/ai/types";

/**
 * Usage tracking.
 *
 * Every metered operation writes a UsageEvent. This is the data the Usage
 * screen reads today and that subscription entitlement will read later — so it
 * is recorded server-side at the moment work happens, never inferred in the
 * browser. Recording must never break the user's request, hence the catches.
 */

export type UsageKind =
  | "ai.request"
  | "ai.title"
  /** A user-initiated provider connection test. It spends real credit, so it is metered. */
  | "ai.provider.test"
  | "file.upload"
  | "code.file.save"
  | "code.file.create"
  | "code.ai.apply"
  | "image.generation"
  | "project.create";

export type RecordUsageInput = {
  userId: string;
  kind: UsageKind;
  provider?: string | null;
  model?: string | null;
  usage?: TokenUsage;
  bytes?: number;
  status?: "success" | "error";
  error?: string | null;
};

export async function recordUsage(input: RecordUsageInput): Promise<void> {
  try {
    await prisma.usageEvent.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        provider: input.provider ?? null,
        model: input.model ?? null,
        inputTokens: input.usage?.inputTokens ?? 0,
        outputTokens: input.usage?.outputTokens ?? 0,
        totalTokens: input.usage?.totalTokens ?? (input.usage?.inputTokens ?? 0) + (input.usage?.outputTokens ?? 0),
        bytes: input.bytes ?? 0,
        status: input.status ?? "success",
        error: input.error ? String(input.error).slice(0, 500) : null,
      },
    });
  } catch (error) {
    console.error("[delter-ai] failed to record usage event:", error);
  }
}

export type UsageSummary = {
  range: { from: Date; to: Date };
  requests: number;
  failedRequests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  uploads: number;
  bytesStored: number;
  imageGenerations: number;
  byModel: { model: string; provider: string | null; requests: number; totalTokens: number }[];
  byDay: { date: string; requests: number; totalTokens: number }[];
};

export async function usageSummary(userId: string, days = 30): Promise<UsageSummary> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  const events = await prisma.usageEvent.findMany({
    where: { userId, createdAt: { gte: from } },
    select: {
      kind: true,
      provider: true,
      model: true,
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
      bytes: true,
      status: true,
      createdAt: true,
    },
  });

  const aiEvents = events.filter((e) => e.kind.startsWith("ai."));
  const byModelMap = new Map<string, { model: string; provider: string | null; requests: number; totalTokens: number }>();
  const byDayMap = new Map<string, { requests: number; totalTokens: number }>();

  for (const event of aiEvents) {
    const model = event.model ?? "unknown";
    const bucket = byModelMap.get(model) ?? { model, provider: event.provider, requests: 0, totalTokens: 0 };
    bucket.requests += 1;
    bucket.totalTokens += event.totalTokens;
    byModelMap.set(model, bucket);

    const day = event.createdAt.toISOString().slice(0, 10);
    const dayBucket = byDayMap.get(day) ?? { requests: 0, totalTokens: 0 };
    dayBucket.requests += 1;
    dayBucket.totalTokens += event.totalTokens;
    byDayMap.set(day, dayBucket);
  }

  return {
    range: { from, to },
    requests: aiEvents.length,
    failedRequests: aiEvents.filter((e) => e.status === "error").length,
    inputTokens: aiEvents.reduce((sum, e) => sum + e.inputTokens, 0),
    outputTokens: aiEvents.reduce((sum, e) => sum + e.outputTokens, 0),
    totalTokens: aiEvents.reduce((sum, e) => sum + e.totalTokens, 0),
    uploads: events.filter((e) => e.kind === "file.upload").length,
    bytesStored: events.filter((e) => e.kind === "file.upload").reduce((sum, e) => sum + e.bytes, 0),
    imageGenerations: events.filter((e) => e.kind === "image.generation").length,
    byModel: Array.from(byModelMap.values()).sort((a, b) => b.requests - a.requests).slice(0, 10),
    byDay: Array.from(byDayMap.entries())
      .map(([date, value]) => ({ date, ...value }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}
