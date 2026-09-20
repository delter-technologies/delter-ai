import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";

/**
 * Signed preview tokens.
 *
 * Why this exists: the Code Studio preview runs inside an iframe with
 * `sandbox="allow-scripts"` and deliberately WITHOUT `allow-same-origin`. That
 * iframe is a unique origin, so the browser will not attach the session cookie
 * to its sub-resource requests (stylesheets, scripts, images). Without a
 * mechanism here, the preview would either have to be unauthenticated or would
 * simply render unstyled.
 *
 * The token is an HMAC over `userId:projectId:expiresAt`, signed with the server
 * secret. It carries no privilege beyond "render this one project's files, for
 * this one user, until this timestamp". It cannot be forged, cannot be widened
 * to another project, and expires quickly.
 */

const TOKEN_TTL_MS = 1000 * 60 * 15; // 15 minutes — a preview session, not a credential

function sign(payload: string): string {
  return createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
}

export function createPreviewToken(userId: string, projectId: string): string {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = `${userId}:${projectId}:${expiresAt}`;
  return `${expiresAt}.${sign(payload)}`;
}

export type PreviewTokenCheck =
  | { ok: true; userId: string; projectId: string }
  | { ok: false; reason: string };

export function verifyPreviewToken(
  token: string | null,
  expected: { userId: string; projectId: string },
): PreviewTokenCheck {
  if (!token) return { ok: false, reason: "no_token" };

  const dot = token.indexOf(".");
  if (dot <= 0) return { ok: false, reason: "malformed" };

  const expiresAt = Number(token.slice(0, dot));
  const signature = token.slice(dot + 1);
  if (!Number.isFinite(expiresAt)) return { ok: false, reason: "malformed" };
  if (expiresAt < Date.now()) return { ok: false, reason: "expired" };

  const payload = `${expected.userId}:${expected.projectId}:${expiresAt}`;
  const expectedSignature = sign(payload);

  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true, userId: expected.userId, projectId: expected.projectId };
}
