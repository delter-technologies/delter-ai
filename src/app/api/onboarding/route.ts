import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { handleRoute, json, ok, readJson } from "@/lib/api";
import { onboardingSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/onboarding
 *
 * Completing onboarding stamps `onboardedAt`. From that moment:
 *   - sign-in routes straight to /app
 *   - /onboarding redirects away to /app
 *   - proxy.ts lets a signed-in user through to the workspace
 * so a user is never shown onboarding twice and never gets stuck on it.
 */
export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireApiUser();
  const body = onboardingSchema.parse(await readJson(request));

  const displayName = body.displayName ?? user.displayName ?? user.name;
  const interests = body.interests?.length ? body.interests.join(", ") : null;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      displayName,
      onboardedAt: user.onboardedAt ?? new Date(),
      mainPurpose: body.mainPurpose ?? user.mainPurpose,
      interests: interests ?? user.interests,
    },
    select: { id: true, displayName: true, onboardedAt: true, mainPurpose: true, interests: true },
  });

  if (!updated.onboardedAt) {
    // Should be unreachable; if it is reached, fail loudly rather than looping.
    return json({ ok: false, error: { message: "Onboarding could not be completed. Please try again." } }, { status: 500 });
  }

  // The client navigates to /app immediately on success.
  return ok({ completed: true, redirectTo: "/app", user: updated });
});

/** GET /api/onboarding — lets the client check whether onboarding is still needed. */
export const GET = handleRoute(async () => {
  const { user } = await requireApiUser();
  return ok({
    needed: !user.onboardedAt,
    displayName: user.displayName,
    mainPurpose: user.mainPurpose,
    interests: user.interests ? user.interests.split(",").map((s) => s.trim()).filter(Boolean) : [],
  });
});
