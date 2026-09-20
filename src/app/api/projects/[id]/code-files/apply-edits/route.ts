import { prisma } from "@/lib/db";
import { assertProjectOwnership, requireApiUser, ApiError } from "@/lib/auth";
import { handleRoute, ok, readJson } from "@/lib/api";
import { applyAiEditsSchema } from "@/lib/validation";
import { validateProjectPath, MAX_FILE_CONTENT_CHARS } from "@/lib/code/paths";
import { languageFor } from "@/lib/code/languages";
import { recordUsage } from "@/lib/usage";
import type { RouteContext } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

/**
 * POST /api/projects/:id/code-files/apply-edits
 *
 * How the Code Studio assistant writes to a project — and, importantly, how it
 * does not:
 *
 *   The model NEVER writes to your project by itself. It proposes changes in its
 *   reply; the assistant panel parses those proposals into the operations below
 *   and shows them to you with before/after content. Nothing reaches the
 *   database until you press Apply, and this endpoint is the only path that
 *   applies them.
 *
 * The whole batch runs in one transaction, so a partial apply (three files
 * written, one rejected) cannot leave a project half-changed.
 */
export const POST = handleRoute(async (request: Request, context: RouteContext<Params>) => {
  const { user } = await requireApiUser();
  const { id } = await context.params;

  const project = await assertProjectOwnership(user.id, id);
  const body = applyAiEditsSchema.parse(await readJson(request));

  if (body.conversationId) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: body.conversationId, userId: user.id },
      select: { id: true, projectId: true },
    });
    if (!conversation) throw new ApiError(404, "That assistant conversation does not exist.");
    if (conversation.projectId && conversation.projectId !== project.id) {
      throw new ApiError(400, "That conversation belongs to a different project, so its edits cannot be applied here.");
    }
  }

  const existing = await prisma.codeFile.findMany({
    where: { projectId: project.id, userId: user.id },
    select: { id: true, path: true, content: true },
  });
  const byPath = new Map(existing.map((file) => [file.path, file]));
  const totalCount = existing.length;

  // Validate the whole batch first: a bad path anywhere should reject everything.
  type Planned =
    | { op: "create"; path: string; content: string; previous: null }
    | { op: "update"; path: string; content: string; previous: string; fileId: string }
    | { op: "delete"; path: string; previous: string; fileId: string };

  const planned = [] as Planned[];

  for (const operation of body.operations) {
    const checked = validateProjectPath(operation.path);
    if (!checked.ok) throw new ApiError(400, `Cannot apply the change to “${operation.path}” — ${checked.message}`);
    const target = checked.value;
    const current = byPath.get(target);

    if (operation.action === "delete") {
      if (!current) throw new ApiError(404, `Cannot delete “${target}” — it is not in this project.`);
      planned.push({ op: "delete", path: target, previous: current.content, fileId: current.id });
      byPath.delete(target);
      continue;
    }

    const content = operation.content ?? "";
    if (content.length > MAX_FILE_CONTENT_CHARS) {
      throw new ApiError(413, `The proposed content for “${target}” is too large to store (limit ≈ 600 KB of text).`);
    }

    if (operation.action === "create") {
      if (current) {
        // The model proposed "create" for a file that already exists. Treat it as
        // an update rather than failing — but report what actually happened.
        planned.push({ op: "update", path: target, content, previous: current.content, fileId: current.id });
      } else {
        if (totalCount + planned.filter((p) => p.op === "create").length > 400) {
          throw new ApiError(409, "Applying these changes would exceed the 400-file limit for a project.");
        }
        planned.push({ op: "create", path: target, content, previous: null });
      }
      byPath.set(target, { id: current?.id ?? "", path: target, content });
      continue;
    }


    // action === "update"
    if (!current) {
      throw new ApiError(
        404,
        `Cannot update “${target}” — it is not in this project. Ask the assistant to create it instead.`,
      );
    }
    planned.push({ op: "update", path: target, content, previous: current.content, fileId: current.id });
    byPath.set(target, { id: current.id, path: target, content });
  }

  if (!planned.length) throw new ApiError(400, "There were no file changes to apply.");

  const creates = planned.filter((p) => p.op === "create");
  const updates = planned.filter((p) => p.op === "update");
  const deletes = planned.filter((p) => p.op === "delete");

  await prisma.$transaction(async (tx) => {
    if (creates.length) {
      await tx.codeFile.createMany({
        data: creates.map((create, index) => ({
          projectId: project.id,
          userId: user.id,
          path: create.path,
          content: create.content,
          language: languageFor(create.path).id,
          position: totalCount + index,
        })),
      });
    }
    for (const update of updates) {
      await tx.codeFile.update({
        where: { id: update.fileId },
        data: { content: update.content, language: languageFor(update.path).id },
      });
    }
    if (deletes.length) {
      await tx.codeFile.deleteMany({
        where: { id: { in: deletes.map((d) => d.fileId) }, userId: user.id, projectId: project.id },
      });
    }
  });

  await recordUsage({
    userId: user.id,
    kind: "code.ai.apply",
    bytes: [...creates, ...updates].reduce(
      (sum, op) => sum + Buffer.byteLength(op.content),
      0,
    ),
  });

  const applied = await prisma.codeFile.findMany({
    where: { projectId: project.id, userId: user.id, path: { in: planned.map((p) => p.path) } },
    select: { id: true, path: true, content: true, language: true, updatedAt: true },
  });

  return ok({
    applied: planned.map((op) => ({
      action: op.op,
      path: op.path,
      charsBefore: op.previous?.length ?? 0,
      charsAfter: op.op === "delete" ? 0 : op.content.length,
    })),
    files: applied.map((file) => ({
      id: file.id,
      path: file.path,
      content: file.content,
      language: file.language,
      languageLabel: languageFor(file.path).label,
      updatedAt: file.updatedAt,
    })),
    counts: { created: creates.length, updated: updates.length, deleted: deletes.length },
  });
});
