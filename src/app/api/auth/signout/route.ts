import { destroySession, getSession } from "@/lib/auth";
import { handleRoute, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/signout
 *
 * Revokes the session row (so the token stops working immediately even if the
 * cookie is replayed) and clears the cookie. Succeeds even with no session, so
 * a user can always get back to a signed-out state.
 */
export const POST = handleRoute(async () => {
  const session = await getSession();
  if (session) await destroySession(session.sessionId);
  return ok({ signedOut: true });
});
