import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { handleRoute, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/user — the full profile the Settings screens render. */
export const GET = handleRoute(async () => {
  const { user } = await requireApiUser();

  const profile = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      displayName: true,
      emailVerified: true,
      onboardedAt: true,
      mainPurpose: true,
      interests: true,
      theme: true,
      defaultModel: true,
      delterAccountId: true,
      createdAt: true,
    },
  });

  return ok({
    user: {
      ...profile,
      interests: profile.interests ? profile.interests.split(",").map((s) => s.trim()).filter(Boolean) : [],
      memberSince: profile.createdAt,
    },
    // The Delter Account is a future unification layer. It is reported as "not
    // linked" rather than hidden, so the Settings screen is honest about state.
    delterAccount: profile.delterAccountId
      ? { linked: true, id: profile.delterAccountId }
      : { linked: false, note: "One Delter Account across Delter products is planned. This workspace currently uses email and password." },
  });
});
