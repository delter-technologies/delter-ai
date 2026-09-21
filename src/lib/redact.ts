import "server-only";

/**
 * Provider and storage SDKs sometimes echo credentials, signed URLs or database
 * connection strings inside their error messages. Those messages can legitimately
 * travel to the browser as part of an honest failure explanation, so anything
 * that looks like a secret is stripped first.
 *
 * This is a safety net, not a substitute for classifying errors.
 */
const SECRET_PATTERNS: [RegExp, string][] = [
  // API keys
  [/sk-ant-[A-Za-z0-9_-]{6,}/gi, "sk-ant-[redacted]"],
  [/sk-[A-Za-z0-9_-]{8,}/gi, "sk-[redacted]"],
  [/github_pat_[A-Za-z0-9_]{6,}/gi, "[redacted]"],
  [/gh[pousr]_[A-Za-z0-9]{10,}/gi, "[redacted]"],
  // Headers carrying credentials
  [/(bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, "$1[redacted]"],
  [/((?:x-api-key|authorization|api-key)(["']?\s*[:=]\s*)["']?)[A-Za-z0-9._~+/=-]{12,}/gi, "$1[redacted]"],
  // AWS style credentials and presigned query parameters
  [/((?:secret[_-]?access[_-]?key|aws[_-]?secret)(["']?\s*[:=]\s*)["']?)[A-Za-z0-9/+=]{12,}/gi, "$1[redacted]"],
  [/((?:access[_-]?key[_-]?id)(["']?\s*[:=]\s*)["']?)[A-Z0-9]{12,}/gi, "$1[redacted]"],
  [/X-Amz-(?:Signature|Credential|Security-Token)=[^&\s"']+/gi, "X-Amz-[redacted]"],
  [/ASIA[0-9A-Z]{16}/g, "[redacted]"],
  // Database URLs with embedded credentials
  [/(?:postgres(?:ql)?|mysql|mssql):\/\/[^\s:@/"]+:[^\s@/"]+@/gi, "postgresql://[redacted]:[redacted]@"],
  // key=value password pairs (only matched when the value has no spaces)
  [/((?:password|passwd|pwd)(["']?\s*[:=]\s*)["']?)[^\s"',;]{6,}/gi, "$1[redacted]"],
];

const MAX_REDACTED_MESSAGE_LENGTH = 400;

/** Remove anything that looks like a secret from a message before it is returned to a client. */
export function redactSecrets(message: string): string {
  let redacted = message;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }
  if (redacted.length > MAX_REDACTED_MESSAGE_LENGTH) {
    redacted = `${redacted.slice(0, MAX_REDACTED_MESSAGE_LENGTH)}…`;
  }
  return redacted.trim();
}
