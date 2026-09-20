import { prisma } from "@/lib/db";
import { handleRoute, ok, readJson } from "@/lib/api";
import { forgotPasswordSchema } from "@/lib/validation";
import { hashSessionToken, randomToken, RESET_TOKEN_TTL_MS } from "@/lib/config";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/forgot-password
 *
 * Creates a single-use reset token. Two modes, because both have to be honest:
 *
 *   - No RESET_EMAIL_URL configured (local development): the token is returned
 *     directly so password recovery is actually testable. This only ever happens
 *     when the environment says so.
 *   - RESET_EMAIL_URL configured (production hook): the token is sent to that
 *     endpoint and only a neutral confirmation comes back, so this route cannot
 *     be used to enumerate registered addresses.
 *
 * Delter AI does not silently pretend to have sent an email it never sent.
 */
export const POST = handleRoute(async (request: Request) => {
  const body = forgotPasswordSchema.parse(await readJson(request));

  const user = await prisma.user.findUnique({ where: { email: body.email }, select: { id: true, email: true } });

  // Match the timing of the "found" path so a fast response does not reveal
  // whether the address exists.
  if (!user) {
    await bcrypt.hash(randomToken(8), 4);
    return ok({ requested: true, delivery: "none", message: NEUTRAL_MESSAGE });
  }

  // Invalidate any outstanding tokens so only the newest link works.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = randomToken(32);
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  const deliveryUrl = process.env.RESET_EMAIL_URL;
  if (deliveryUrl) {
    try {
      await fetch(deliveryUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: user.email,
          type: "password_reset",
          resetPath: `/reset-password?token=${token}`,
          product: "Delter AI",
        }),
      });
    } catch (error) {
      // A failed delivery must not become a 500 the user cannot act on, and must
      // not leak that the account exists. Log it server-side.
      console.error("[delter-ai] password reset delivery failed:", error);
    }
    return ok({ requested: true, delivery: "sent", message: NEUTRAL_MESSAGE });
  }

  return ok({
    requested: true,
    delivery: "dev",
    resetPath: `/reset-password?token=${token}`,
    message:
      "No email delivery service is configured on this server, so Delter AI returned the reset link here instead of pretending to send one. Set RESET_EMAIL_URL in .env to deliver it by email.",
  });
});

const NEUTRAL_MESSAGE =
  "If an account exists for that address, a password reset link is on its way. The link expires in one hour.";
