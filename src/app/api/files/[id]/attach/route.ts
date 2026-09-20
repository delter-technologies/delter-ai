import { prisma } from "@/lib/db";
import { assertConversationOwnership, assertFileOwnership, requireApiUser, ApiError } from "@/lib/auth";
import { handleRoute, ok, readJson } from "@/lib/api";
import { z } from "zod";
import type { RouteContext } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

const schema = z.object({
  conversationId: z.string().min(1),
});

/**
 * POST /api/files/:id/attach   — add a file as explicit context for a conversation
 * DELETE /api/files/:id/attach — remove it again
 *
 * Files only reach a model when the user attaches them here. Nothing is sent
 * implicitly, which keeps context relevant and avoids uploading unrelated data.
 */
export const POST = handleRoute(async (request: Request, context: RouteContext<Params>) => {
  const { user } = await requireApiUser();
  const { id } = await context.params;
  const { conversationId: requestedConversationId } = schema.parse(await readJson(request));
  const conversationId: string = requestedConversationId;

  const file = await assertFileOwnership(user.id, id);
  await assertConversationOwnership(user.id, conversationId);

  const existing = await prisma.conversationFile.count({ where: { conversationId, fileId: file.id } });
  if (existing >= 10) {
    throw new ApiError(400, "A conversation can hold up to 10 attached files. Remove one before adding another.");
  }

  if (!existing) {
    await prisma.conversationFile.create({ data: { conversationId, fileId: file.id } });
  }

  return ok({ attached: true, fileId: file.id, conversationId });
});

export const DELETE = handleRoute(async (request: Request, context: RouteContext<Params>) => {
  const { user } = await requireApiUser();
  const { id } = await context.params;
  const { conversationId: requestedConversationId } = schema.parse(await readJson(request));
  const conversationId: string = requestedConversationId;

  const file = await assertFileOwnership(user.id, id);
  await assertConversationOwnership(user.id, conversationId);

  await prisma.conversationFile.deleteMany({ where: { conversationId, fileId: file.id } });
  return ok({ attached: false, fileId: file.id, conversationId });
});
