/**
 * Device labels for the sessions list.
 *
 * Deliberately limited to what a User-Agent string can honestly tell us: a
 * browser family and an operating system. Anything else is reported as unknown
 * rather than guessed — no invented locations, no invented device models.
 */
export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const ua = userAgent.toLowerCase();

  const os = /windows/.test(ua)
    ? "Windows"
    : /iphone|ipad|ios/.test(ua)
      ? /ipad/.test(ua)
        ? "iPadOS"
        : "iOS"
      : /android/.test(ua)
        ? "Android"
        : /mac os|macintosh/.test(ua)
          ? "macOS"
          : /linux/.test(ua)
            ? "Linux"
            : null;

  const browser = /edg\//.test(ua)
    ? "Edge"
    : /opr\/|opera/.test(ua)
      ? "Opera"
      : /chrome|crios/.test(ua)
        ? "Chrome"
        : /safari/.test(ua)
          ? "Safari"
          : /firefox|fxios/.test(ua)
            ? "Firefox"
            : null;

  return [browser, os].filter(Boolean).join(" on ") || "Unknown browser";
}
