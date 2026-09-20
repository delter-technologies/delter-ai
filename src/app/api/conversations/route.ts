import { prisma } from "@/lib/db";
import { assertProjectOwnership, requireApiUser } from "@/lib/auth";
import { handleRoute, ok, readJson } from "@/lib/api";
import { createConversationSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/conversations?projectId=…&kind=chat&code&limit=50
 *
 * Backs the Chat sidebar and the Code Studio assistant history. Scoping is
 * always `userId` first; `projectId` narrows within it and is verified.
 */
export const GET = handleRoute(async (request: Request) => {
  const { user } = await requireApiUser();
  const url = new URL(request.url);

  const projectId = url.searchParams.get("projectId");
  const scope = url.searchParams.get("scope"); // "project" | "global" | null
  const kind = url.searchParams.get("kind") === "code" ? "code" : null;
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200);

  if (projectId) await assertProjectOwnership(user.id, projectId);

  const where: Record<string, unknown> = { userId: user.id };
  if (kind) where.kind = kind;
  if (scope === "project" && projectId) where.projectId = projectId;
  else if (scope === "global") where.projectId = null;

  const conversations = await prisma.conversation.findMany({
    where,
    orderBy: { lastMessageAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      kind: true,
      projectId: true,
      provider: true,
      model: true,
      lastMessageAt: true,
      createdAt: true,
      project: { select: { id: true, name: true } },
      _count: { select: { messages: true } },
    },
  });

  return ok({
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      kind: conversation.kind,
      projectId: conversation.projectId,
      projectName: conversation.project?.name ?? null,
      provider: conversation.provider,
      model: conversation.model,
      lastMessageAt: conversation.lastMessageAt,
      createdAt: conversation.createdAt,
      messageCount: conversation._count.messages,
    })),
  });
});

/** POST /api/conversations — start an empty conversation, optionally inside a project. */
export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireApiUser();
  const body = createConversationSchema.parse(await readJson(request));

  if (body.projectId) await assertProjectOwnership(user.id, body.projectId);

  const conversation = await prisma.conversation.create({
    data: {
      userId: user.id,
      projectId: body.projectId ?? null,
      kind: body.kind,
      title: body.title ?? (body.kind === "code" ? "Code Studio session" : "New chat"),
      model: user.defaultModel,
    },
    select: {
      id: true,
      title: true,
      kind: true,
      projectId: true,
      provider: true,
      model: true,
      lastMessageAt: true,
      createdAt: true,
    },
  });

  return ok({ conversation });
});
