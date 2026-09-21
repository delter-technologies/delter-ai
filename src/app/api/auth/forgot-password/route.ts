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
 * Creates a single-use reset token. Three outcomes, because all three have to be
 * honest:
 *
 *   - RESET_EMAIL_URL configured: the link is POSTed to that delivery endpoint and
 *     only a neutral confirmation comes back, so this route cannot be used to
 *     enumerate registered addresses.
 *   - No RESET_EMAIL_URL on a development server: the link is returned directly so
 *     password recovery is actually testable. This branch is unreachable in
 *     production.
 *   - No RESET_EMAIL_URL in production: no token is created and nothing is
 *     returned but a clear "reset is not available here" message. A working reset
 *     link in an HTTP response would be an account-takeover hole, so Delter AI
 *     refuses to mint one. The response is identical for every address, so it
 *     reveals nothing about which accounts exist.
 *
 * Delter AI does not silently pretend to have sent an email it never sent.
 */
export const POST = handleRoute(async (request: Request) => {
  const body = forgotPasswordSchema.parse(await readJson(request));

  const isProduction = process.env.NODE_ENV === "production";
  const deliveryUrl = process.env.RESET_EMAIL_URL;
  const senderConfigured = Boolean(deliveryUrl);

  // Checked before any lookup: without a way to deliver the link, production
  // refuses to create one, and the answer must not depend on the account.
  if (!senderConfigured && isProduction) {
    console.error(
      "[delter-ai] forgot-password was called but RESET_EMAIL_URL is not set, so no reset link can be delivered. Configure RESET_EMAIL_URL to enable password recovery (see DEPLOY.md).",
    );
    return ok({ requested: true, delivery: "unavailable", message: UNAVAILABLE_MESSAGE });
  }

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

  // Development only, by construction: production without a sender returned above.
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

const UNAVAILABLE_MESSAGE =
  "Password reset by email is not enabled on this server yet, so no reset link could be created. Contact whoever runs this Delter AI workspace, or sign in and change your password under Settings → Account.";
