import "server-only";
import crypto from "node:crypto";

/**
 * Runtime configuration. Read once, on the server, from environment variables.
 * Nothing in this module (or anything that imports it) is ever reachable from
 * client components — that is what keeps provider keys out of the browser.
 */

const SESSION_COOKIE = "delter_session";

/** Session lifetime when "keep me signed in" is not ticked. */
export const SESSION_TTL_SHORT_MS = 1000 * 60 * 60 * 12; // 12 hours
/** Session lifetime when the user asks to stay signed in. */
export const SESSION_TTL_LONG_MS = 1000 * 60 * 60 * 24 * 60; // 60 days
/** Password-reset links expire quickly. */
export const RESET_TOKEN_TTL_MS = 1000 * 60 * 60; // 1 hour

export const config = {
  sessionCookie: SESSION_COOKIE,
  /**
   * A stable secret used for hashing session tokens and IPs. Falls back to a
   * development constant so a fresh clone still boots — production deploys must
   * set SESSION_SECRET.
   */
  sessionSecret: process.env.SESSION_SECRET || "delter-ai-dev-secret-do-not-use-in-production",
  isProduction: process.env.NODE_ENV === "production",
  maxUploadBytes: (Number(process.env.MAX_UPLOAD_MB) || 25) * 1024 * 1024,
  /** Absolute path of the on-disk storage root for user uploads. */
  storageRoot: process.env.STORAGE_ROOT || `${process.cwd()}/data/storage`,
  /**
   * Default cap on AI output tokens for a single request.
   *
   * This is not just a cost guard. Providers that pre-authorise credit —
   * OpenRouter holds `max_tokens × output price` before it starts — refuse an
   * uncapped request from a small balance even when the actual reply would be
   * short. Without a cap, OpenRouter assumed the model's maximum (64k for
   * Claude Sonnet) and rejected requests with "This request requires more
   * credits, or fewer max_tokens". Callers can still pass their own value.
   */
  aiMaxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS) || 2048,
} as const;

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** One-way hash used for session tokens and reset tokens. */
export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Hash a session token together with the app secret. */
export function hashSessionToken(token: string): string {
  return crypto.createHmac("sha256", config.sessionSecret).update(token).digest("hex");
}

/**
 * Timing-safe string compare. Used for reset tokens so a partial guess cannot be
 * confirmed by response timing.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function newId(prefix: string): string {
  return `${prefix}_${randomToken(12)}`;
}
