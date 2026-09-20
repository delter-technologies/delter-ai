import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, listActiveSessions } from "@/lib/auth";
import { usageSummary } from "@/lib/usage";
import { storageDescription, storageUsageBytes } from "@/lib/storage";
import { allModels, availableModels, providerStatuses, resolveModel } from "@/lib/ai/registry";
import { describeUserAgent } from "@/lib/device";
import { SettingsView, type SettingsData } from "@/components/settings/SettingsView";

export const dynamic = "force-dynamic";

export const metadata = { title: "Settings" };

/**
 * Settings.
 *
 * Everything on this page is read straight from the database and the server
 * environment: the profile row, live session rows, real usage events, real bytes
 * on disk, and the actual provider configuration. There are no placeholder
 * numbers here and no toggles that do nothing — if a capability does not exist
 * yet (billing, email delivery, a linked Delter Account), the page says so in
 * plain words instead of showing a control that cannot work.
 */
export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/signin");
  if (!session.user.onboardedAt) redirect("/onboarding");

  const { user } = session;

  const [profile, sessions, usage, diskBytes, projectCount, conversationCount, fileCount, codeFileCount] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          name: true,
          displayName: true,
          emailVerified: true,
          mainPurpose: true,
          interests: true,
          theme: true,
          defaultModel: true,
          delterAccountId: true,
          onboardedAt: true,
          createdAt: true,
        },
      }),
      listActiveSessions(user.id),
      usageSummary(user.id, 30),
      storageUsageBytes(user.id),
      prisma.project.count({ where: { userId: user.id, archivedAt: null } }),
      prisma.conversation.count({ where: { userId: user.id } }),
      prisma.fileAsset.count({ where: { userId: user.id } }),
      prisma.codeFile.count({ where: { userId: user.id } }),
    ]);

  const statuses = providerStatuses();
  const available = new Set(availableModels().map((model) => model.id));
  const resolution = resolveModel(profile.defaultModel, profile.defaultModel);

  const data: SettingsData = {
    user: {
      id: profile.id,
      email: profile.email,
      // `name` is nullable in the schema; the form shows an empty field rather
      // than inventing one.
      name: profile.name ?? "",
      displayName: profile.displayName,
      emailVerified: profile.emailVerified,
      mainPurpose: profile.mainPurpose,
      interests: profile.interests
        ? profile.interests.split(",").map((value) => value.trim()).filter(Boolean)
        : [],
      theme: profile.theme === "light" || profile.theme === "dark" ? profile.theme : "system",
      defaultModel: profile.defaultModel,
      memberSince: profile.createdAt.toISOString(),
      onboardedAt: profile.onboardedAt ? profile.onboardedAt.toISOString() : null,
    },
    delterAccount: profile.delterAccountId
      ? { linked: true, id: profile.delterAccountId }
      : {
          linked: false,
          note: "One Delter Account across Delter products is planned. This workspace currently signs you in with an email address and a password held on this server.",
        },
    providers: statuses.map((status) => ({
      id: status.id,
      label: status.label,
      configured: status.configured,
      reason: status.reason ?? null,
    })),
    models: allModels().map((model) => ({
      id: model.id,
      label: model.label,
      provider: model.provider,
      providerLabel: statuses.find((status) => status.id === model.provider)?.label ?? model.provider,
      available: available.has(model.id),
      description: model.description ?? null,
    })),
    activeModel: { id: resolution.model.id, label: resolution.model.label, providerLabel: resolution.provider.label },
    demoMode: resolution.provider.id === "delter-demo",
    resetEmailConfigured: Boolean(process.env.RESET_EMAIL_URL),
    sessions: sessions.map((entry) => ({
      id: entry.id,
      current: entry.id === session.sessionId,
      device: describeUserAgent(entry.userAgent),
      userAgent: entry.userAgent,
      remember: entry.remember,
      createdAt: entry.createdAt.toISOString(),
      lastSeenAt: entry.lastSeenAt.toISOString(),
      expiresAt: entry.expiresAt.toISOString(),
    })),
    usage: {
      days: 30,
      ai: {
        requests: usage.requests,
        failedRequests: usage.failedRequests,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        byModel: usage.byModel,
        byDay: usage.byDay,
      },
      storage: {
        backend: storageDescription(),
        uploads: usage.uploads,
        bytesOnDisk: diskBytes,
        bytesRecorded: usage.bytesStored,
        fileCount,
        codeFileCount,
      },
      workspace: { projectCount, conversationCount },
      images: { generations: usage.imageGenerations },
      billing: {
        enabled: false,
        note: "Usage is recorded, but plans and payments are roadmap step 21 and are not active. Nothing is charged and no limits are enforced yet.",
      },
    },
    limits: { maxUploadMb: Math.round(Number(process.env.MAX_UPLOAD_MB || 25)) },
  };

  return <SettingsView data={data} />;
}
