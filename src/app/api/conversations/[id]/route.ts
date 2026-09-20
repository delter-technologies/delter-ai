import { prisma } from "@/lib/db";
import { assertConversationOwnership, assertProjectOwnership, requireApiUser, ApiError } from "@/lib/auth";
import { handleRoute, ok, readJson } from "@/lib/api";
import { updateConversationSchema } from "@/lib/validation";
import { findModel } from "@/lib/ai/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

/**
 * GET /api/conversations/:id
 *
 * Returns the conversation, its full message history and the files explicitly
 * attached as context. Everything is filtered by `userId`.
 */
export const GET = handleRoute(async (_request: Request, context: { params: Promise<Params> }) => {
  const { user } = await requireApiUser();
  const { id } = await context.params;

  await assertConversationOwnership(user.id, id);

  const conversation = await prisma.conversation.findFirst({
    where: { id, userId: user.id },
    include: {
      project: { select: { id: true, name: true, kind: true } },
      attachedFiles: {
        select: { file: { select: { id: true, name: true, mimeType: true, size: true, extractable: true } } },
      },
    },
  });
  if (!conversation) throw new ApiError(404, "That conversation does not exist or you do not have access to it.");

  const messages = await prisma.message.findMany({
    where: { conversationId: id, userId: user.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      error: true,
      provider: true,
      model: true,
      pending: true,
      totalTokens: true,
      durationMs: true,
      createdAt: true,
    },
  });

  return ok({
    conversation: {
      id: conversation.id,
      title: conversation.title,
      kind: conversation.kind,
      projectId: conversation.projectId,
      projectName: conversation.project?.name ?? null,
      projectKind: conversation.project?.kind ?? null,
      provider: conversation.provider,
      model: conversation.model,
      lastMessageAt: conversation.lastMessageAt,
      createdAt: conversation.createdAt,
      attachedFiles: conversation.attachedFiles.map((link) => link.file),
    },
    messages,
  });
});

/** PATCH /api/conversations/:id — rename, move between projects, switch model. */
export const PATCH = handleRoute(async (request: Request, context: { params: Promise<Params> }) => {
  const { user } = await requireApiUser();
  const { id } = await context.params;
  await assertConversationOwnership(user.id, id);

  const body = updateConversationSchema.parse(await readJson(request));

  if (body.projectId) await assertProjectOwnership(user.id, body.projectId);
  if (body.model && !findModel(body.model)) {
    throw new ApiError(400, "Delter AI does not recognise that model. Pick one from the model list.");
  }

  const conversation = await prisma.conversation.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.projectId !== undefined ? { projectId: body.projectId } : {}),
      ...(body.model !== undefined ? { model: body.model } : {}),
    },
    select: { id: true, title: true, projectId: true, model: true, kind: true, lastMessageAt: true },
  });

  return ok({ conversation });
});

/** DELETE /api/conversations/:id — cascades to messages and file links. */
export const DELETE = handleRoute(async (_request: Request, context: { params: Promise<Params> }) => {
  const { user } = await requireApiUser();
  const { id } = await context.params;
  const conversation = await assertConversationOwnership(user.id, id);

  await prisma.conversation.delete({ where: { id: conversation.id } });
  return ok({ deleted: true, id });
});
