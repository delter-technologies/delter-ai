import { listActiveSessions, requireApiUser } from "@/lib/auth";
import { describeUserAgent } from "@/lib/device";
import { handleRoute, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/auth/sessions — the devices list on Settings → Security. */
export const GET = handleRoute(async () => {
  const { user, sessionId } = await requireApiUser();
  const sessions = await listActiveSessions(user.id);

  return ok({
    sessions: sessions.map((session) => ({
      id: session.id,
      current: session.id === sessionId,
      device: describeUserAgent(session.userAgent),
      userAgent: session.userAgent,
      remember: session.remember,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
    })),
  });
});
