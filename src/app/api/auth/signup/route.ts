import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { handleRoute, json, ok, readJson } from "@/lib/api";
import { signUpSchema, safeNextPath } from "@/lib/validation";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/signup
 *
 * Creates the account and signs the user in in the same request, then returns
 * the path the client should navigate to. That path is `/onboarding` for a brand
 * new account — and onboarding itself routes straight into the workspace when it
 * finishes, so a new user is never parked on a landing page.
 */
export const POST = handleRoute(async (request: Request) => {
  const body = signUpSchema.parse(await readJson(request));

  const existing = await prisma.user.findUnique({ where: { email: body.email }, select: { id: true } });
  if (existing) {
    // Deliberately a 409 rather than a vague error: the user needs to know to
    // sign in instead. The email is one they just typed, so this leaks nothing
    // they did not already have.
    return json(
      { ok: false, error: { message: "An account already exists with that email. Sign in instead.", code: "email_taken" } },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(body.password, 12);

  const user = await prisma.user.create({
    data: {
      email: body.email,
      passwordHash,
      name: body.name,
      displayName: body.name.split(" ")[0] ?? body.name,
    },
    select: { id: true, email: true, name: true },
  });

  await createSession(user.id, {
    userAgent: request.headers.get("user-agent"),
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });

  const next = safeNextPath(new URL(request.url).searchParams.get("next"), "/onboarding");

  return ok({ user, redirectTo: next });
});
