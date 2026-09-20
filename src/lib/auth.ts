import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  config,
  hashSessionToken,
  randomToken,
  SESSION_TTL_LONG_MS,
  SESSION_TTL_SHORT_MS,
} from "@/lib/config";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  displayName: string | null;
  onboardedAt: Date | null;
  theme: string;
  defaultModel: string | null;
  mainPurpose: string | null;
  interests: string | null;
  createdAt: Date;
};

export type AuthContext = {
  user: SessionUser;
  sessionId: string;
};

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  displayName: true,
  onboardedAt: true,
  theme: true,
  defaultModel: true,
  mainPurpose: true,
  interests: true,
  createdAt: true,
} as const;

function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.isProduction,
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}

/** Read the current session from the request cookie, if it is valid. */
export async function getSession(): Promise<AuthContext | null> {
  const store = await cookies();
  const token = store.get(config.sessionCookie)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: { select: USER_SELECT } },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;

  // Sliding expiry, written at most once an hour so a page view is not a DB write.
  const anHourAgo = Date.now() - 1000 * 60 * 60;
  if (session.lastSeenAt.getTime() < anHourAgo) {
    const ttl = session.remember ? SESSION_TTL_LONG_MS : SESSION_TTL_SHORT_MS;
    await prisma.session
      .update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + ttl) },
      })
      .catch(() => {
        // A failed "touch" must never log the user out.
      });
  }

  return { user: session.user as SessionUser, sessionId: session.id };
}

/** Best-effort current path, used to return the user where they were headed. */
async function currentPath(): Promise<string | null> {
  try {
    const h = await headers();
    const url = new URL(h.get("x-url") ?? h.get("referer") ?? "");
    if (!url.pathname || url.pathname === "/") return null;
    if (url.pathname.startsWith("/signin") || url.pathname.startsWith("/signup")) return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

/** For pages/layouts: returns the session or redirects to sign-in. */
export async function requireUser(): Promise<AuthContext> {
  const session = await getSession();
  if (!session) {
    const next = await currentPath();
    redirect(next ? `/signin?next=${encodeURIComponent(next)}` : "/signin");
  }
  return session;
}

/** For route handlers: throws an ApiError instead of redirecting. */
export async function requireApiUser(): Promise<AuthContext> {
  const session = await getSession();
  if (!session) {
    throw new ApiError(401, "Your session has ended. Please sign in again to continue.");
  }
  return session;
}

/** Create a session and set the cookie. */
export async function createSession(
  userId: string,
  opts: { remember?: boolean; userAgent?: string | null; ip?: string | null } = {},
) {
  const token = randomToken(32);
  const ttl = opts.remember ? SESSION_TTL_LONG_MS : SESSION_TTL_SHORT_MS;

  await prisma.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId,
      remember: Boolean(opts.remember),
      expiresAt: new Date(Date.now() + ttl),
      userAgent: opts.userAgent?.slice(0, 300) ?? null,
      ipHash: opts.ip ? hashSessionToken(opts.ip) : null,
    },
  });

  const store = await cookies();
  store.set(config.sessionCookie, token, cookieOptions(ttl));
  return token;
}

export async function destroySession(sessionId: string) {
  await prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } }).catch(() => {});
  const store = await cookies();
  store.set(config.sessionCookie, "", { ...cookieOptions(0), maxAge: 0 });
}

/** Revoke every session except the one in use (Settings → Security). */
export async function revokeOtherSessions(userId: string, currentSessionId: string) {
  const result = await prisma.session.updateMany({
    where: { userId, id: { not: currentSessionId }, revokedAt: null, expiresAt: { gt: new Date() } },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export async function listActiveSessions(userId: string) {
  return prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    take: 25,
    select: {
      id: true,
      createdAt: true,
      lastSeenAt: true,
      remember: true,
      userAgent: true,
      expiresAt: true,
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Ownership assertions — the server-side authorisation layer                  */
/* -------------------------------------------------------------------------- */

export async function assertProjectOwnership(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) throw new ApiError(404, "That project does not exist or you do not have access to it.");
  return project;
}

export async function assertConversationOwnership(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, userId } });
  if (!conversation) throw new ApiError(404, "That conversation does not exist or you do not have access to it.");
  return conversation;
}

export async function assertFileOwnership(userId: string, fileId: string) {
  const file = await prisma.fileAsset.findFirst({ where: { id: fileId, userId } });
  if (!file) throw new ApiError(404, "That file does not exist or you do not have access to it.");
  return file;
}

export async function assertCodeFileOwnership(userId: string, codeFileId: string) {
  const codeFile = await prisma.codeFile.findFirst({ where: { id: codeFileId, userId } });
  if (!codeFile) throw new ApiError(404, "That file does not exist or you do not have access to it.");
  return codeFile;
}

/** An error carrying an HTTP status and a message that is safe to show a user. */
export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}
