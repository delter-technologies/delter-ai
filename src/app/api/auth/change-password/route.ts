import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { handleRoute, json, ok, readJson } from "@/lib/api";
import { changePasswordSchema } from "@/lib/validation";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/change-password
 *
 * Requires the current password. On success the calling session stays alive and
 * every other session is revoked, so a user who is changing a password because
 * they suspect a leak actually gets the leak closed.
 */
export const POST = handleRoute(async (request: Request) => {
  const { user, sessionId } = await requireApiUser();
  const body = changePasswordSchema.parse(await readJson(request));

  const record = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!record) return json({ ok: false, error: { message: "Your account could not be found. Please sign in again." } }, { status: 401 });

  const valid = await bcrypt.compare(body.currentPassword, record.passwordHash);
  if (!valid) {
    return json({ ok: false, error: { message: "Your current password is not correct." } }, { status: 403 });
  }

  if (body.currentPassword === body.newPassword) {
    return json({ ok: false, error: { message: "Choose a new password that is different from your current one." } }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(body.newPassword, 12);
  const revoked = await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.session.updateMany({
      where: { userId: user.id, id: { not: sessionId }, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  return ok({ changed: true, otherSessionsSignedOut: revoked[1].count });
});
