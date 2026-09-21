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

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/** The development fallback is public in this repository, so it is never usable in production. */
const DEV_SESSION_SECRET = "delter-ai-dev-secret-do-not-use-in-production";
const MIN_SESSION_SECRET_LENGTH = 32;

/**
 * Resolve the secret used to HMAC session and password-reset tokens.
 *
 * A missing or short secret in production would let anyone who reads this
 * repository forge a session cookie for any account, so production refuses to
 * boot without one. Development keeps the convenience fallback and says so out
 * loud in the server log.
 */
function resolveSessionSecret(): string {
  const secret = (process.env.SESSION_SECRET ?? "").trim();

  if (secret.length >= MIN_SESSION_SECRET_LENGTH) return secret;

  if (IS_PRODUCTION) {
    throw new Error(
      `SESSION_SECRET must be set to at least ${MIN_SESSION_SECRET_LENGTH} characters in production` +
        (secret ? ` (the provided value is ${secret.length}).` : ", but it is not set.") +
        " Without it, session and password-reset tokens could be forged. Generate one with:" +
        " node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\"",
    );
  }

  if (!secret) {
    console.warn(
      "[delter-ai] SESSION_SECRET is not set — falling back to a development-only secret. Sessions are forgeable; never deploy this configuration.",
    );
  }
  return secret || DEV_SESSION_SECRET;
}

export const config = {
  sessionCookie: SESSION_COOKIE,
  /** Stable secret used for hashing session tokens and IPs. See resolveSessionSecret. */
  sessionSecret: resolveSessionSecret(),
  isProduction: IS_PRODUCTION,
  maxUploadBytes: (Number(process.env.MAX_UPLOAD_MB) || 25) * 1024 * 1024,
  /** Absolute path of the on-disk storage root for user uploads (local driver). */
  storageRoot: process.env.STORAGE_ROOT || `${process.cwd()}/data/storage`,
  // The active storage driver is resolved in @/lib/storage-drivers, which is the
  // single source of truth for STORAGE_DRIVER (and refuses to guess in
  // production). `storageRoot` and `s3` below are that module's inputs.
  s3: {
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION || "auto",
    bucket: process.env.S3_BUCKET || "",
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
    /** Optional key prefix, so one bucket can hold several environments. */
    prefix: process.env.S3_PREFIX || "",
    // Path-style addressing is what R2, Supabase and MinIO expect; virtual-host
    // style needs wildcard DNS. Override only if your bucket requires it.
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  },
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
