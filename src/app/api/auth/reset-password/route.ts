import { prisma } from "@/lib/db";
import { handleRoute, json, ok, readJson } from "@/lib/api";
import { resetPasswordSchema } from "@/lib/validation";
import { hashSessionToken } from "@/lib/config";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/reset-password
 *
 * Validates a single-use token, sets the new password, then revokes every
 * existing session — a password reset should sign out any device that was
 * signed in with the old credentials.
 */
export const POST = handleRoute(async (request: Request) => {
  const body = resetPasswordSchema.parse(await readJson(request));

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashSessionToken(body.token) },
    include: { user: { select: { id: true } } },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return json(
      {
        ok: false,
        error: {
          message:
            "That password reset link is invalid or has expired. Request a new one and use the most recent email.",
          code: "invalid_token",
        },
      },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(body.password, 12);

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.user.id }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.session.updateMany({ where: { userId: record.user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);

  return ok({ reset: true, message: "Your password has been updated. Sign in with your new password." });
});
