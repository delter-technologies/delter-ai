import { prisma } from "@/lib/db";
import { createSession, getSession } from "@/lib/auth";
import { handleRoute, json, ok, readJson } from "@/lib/api";
import { signInSchema, safeNextPath } from "@/lib/validation";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_FAILURE = "That email and password combination did not match an account. Please check and try again.";

/**
 * POST /api/auth/signin
 *
 * Routing contract from the brief:
 *   - onboarded user   → straight to /app (the workspace)
 *   - not yet onboarded → /onboarding, which then routes into /app
 * A `next` target is honoured only when it is an internal workspace path.
 */
export const POST = handleRoute(async (request: Request) => {
  const url = new URL(request.url);
  const body = signInSchema.parse(await readJson(request));

  // If a session is already live, do not create a second one — just route on.
  const existing = await getSession();
  if (existing) {
    const target = safeNextPath(body.next ?? url.searchParams.get("next"));
    return ok({
      user: { id: existing.user.id, email: existing.user.email, name: existing.user.name },
      redirectTo: existing.user.onboardedAt ? target : "/onboarding",
    });
  }

  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user) {
    // Burn roughly the same time as a real comparison so response timing does
    // not reveal whether an address is registered.
    await bcrypt.compare(body.password, "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin");
    return json({ ok: false, error: { message: GENERIC_FAILURE } }, { status: 401 });
  }

  const valid = await bcrypt.compare(body.password, user.passwordHash);
  if (!valid) {
    return json({ ok: false, error: { message: GENERIC_FAILURE } }, { status: 401 });
  }

  await createSession(user.id, {
    remember: body.remember,
    userAgent: request.headers.get("user-agent"),
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });

  const requested = safeNextPath(body.next ?? url.searchParams.get("next"));
  const redirectTo = user.onboardedAt ? requested : "/onboarding";

  return ok({
    user: { id: user.id, email: user.email, name: user.name, displayName: user.displayName },
    redirectTo,
    onboarded: Boolean(user.onboardedAt),
  });
});
