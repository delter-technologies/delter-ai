import { prisma } from "@/lib/db";
import { destroySession, requireApiUser } from "@/lib/auth";
import { ApiError } from "@/lib/auth";
import { handleRoute, ok, type RouteContext } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/auth/sessions/:id — sign out one device.
 *
 * Ownership is enforced in the query itself: a session id belonging to another
 * user matches nothing, so it cannot be revoked by guessing ids.
 */
export const DELETE = handleRoute(async (_request: Request, context: RouteContext<{ id: string }>) => {
  const { user, sessionId } = await requireApiUser();
  const { id } = await context.params;

  const target = await prisma.session.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!target) throw new ApiError(404, "That session does not exist or has already ended.");

  if (target.id === sessionId) {
    await destroySession(sessionId);
    return ok({ revoked: true, current: true });
  }

  await prisma.session.update({ where: { id: target.id }, data: { revokedAt: new Date() } });
  return ok({ revoked: true, current: false });
});
