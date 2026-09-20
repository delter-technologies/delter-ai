import { prisma } from "@/lib/db";
import { assertConversationOwnership, requireApiUser } from "@/lib/auth";
import { handleRoute, ok, readJson } from "@/lib/api";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

/**
 * GET /api/conversations/:id/messages?after=<iso>&limit=200
 *
 * Incremental history fetch. The chat surface loads a conversation with the
 * first GET, then polls this while a response is streaming in another tab.
 */
export const GET = handleRoute(async (request: Request, context: { params: Promise<Params> }) => {
  const { user } = await requireApiUser();
  const { id } = await context.params;
  await assertConversationOwnership(user.id, id);

  const url = new URL(request.url);
  const after = url.searchParams.get("after");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 200), 1), 500);

  const messages = await prisma.message.findMany({
    where: {
      conversationId: id,
      userId: user.id,
      ...(after ? { updatedAt: { gt: new Date(after) } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      role: true,
      content: true,
      error: true,
      provider: true,
      model: true,
      pending: true,
      promptTokens: true,
      completionTokens: true,
      totalTokens: true,
      durationMs: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return ok({ messages });
});

const deleteSchema = z.object({ messageIds: z.array(z.string().min(1)).min(1).max(500) });

/** DELETE /api/conversations/:id/messages — clears history but keeps the conversation. */
export const DELETE = handleRoute(async (request: Request, context: { params: Promise<Params> }) => {
  const { user } = await requireApiUser();
  const { id } = await context.params;
  await assertConversationOwnership(user.id, id);

  const body = deleteSchema.parse(await readJson(request));

  const result = await prisma.message.deleteMany({
    where: { conversationId: id, userId: user.id, id: { in: body.messageIds } },
  });

  return ok({ deleted: result.count });
});
