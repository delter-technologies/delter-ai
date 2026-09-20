import { prisma } from "@/lib/db";
import { assertProjectOwnership, requireApiUser, ApiError } from "@/lib/auth";
import { handleRoute, json, ok, readJson } from "@/lib/api";
import { renameCodeFileSchema, updateCodeFileSchema } from "@/lib/validation";
import { validateProjectPath, MAX_FILE_CONTENT_CHARS } from "@/lib/code/paths";
import { languageFor } from "@/lib/code/languages";
import { recordUsage } from "@/lib/usage";
import type { RouteContext } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string; fileId: string };

/**
 * Both the project and the file are checked against the session user, so a
 * request that mixes someone else's project id with your own file id (or the
 * reverse) cannot succeed.
 */
async function loadOwnedFile(userId: string, projectId: string, fileId: string) {
  const project = await assertProjectOwnership(userId, projectId);
  const file = await prisma.codeFile.findFirst({ where: { id: fileId, projectId: project.id, userId } });
  if (!file) throw new ApiError(404, "That file is not in this project, or you do not have access to it.");
  return { project, file };
}

const SELECT = {
  id: true,
  path: true,
  content: true,
  language: true,
  position: true,
  createdAt: true,
  updatedAt: true,
} as const;

function serialise(file: {
  id: string;
  path: string;
  content: string;
  language: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: file.id,
    path: file.path,
    name: file.path.split("/").pop() ?? file.path,
    language: file.language,
    languageLabel: languageFor(file.path).label,
    content: file.content,
    chars: file.content.length,
    lines: file.content ? file.content.split("\n").length : 0,
    position: file.position,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  };
}

/** GET /api/projects/:id/code-files/:fileId — the editor loads a file with this. */
export const GET = handleRoute(async (_request: Request, context: RouteContext<Params>) => {
  const { user } = await requireApiUser();
  const { id, fileId } = await context.params;
  const { file } = await loadOwnedFile(user.id, id, fileId);

  return ok({ file: serialise(file) });
});

/**
 * PUT /api/projects/:id/code-files/:fileId — save contents.
 *
 * This is the persistence guarantee behind Code Studio: the editor debounces
 * saves into this route, the response carries the stored `updatedAt`, and the UI
 * shows Saving → Saved from real server state rather than a guessed timer.
 *
 * `expectedUpdatedAt` enables optimistic concurrency: if the file changed since
 * the editor loaded it (another tab, or an AI apply), the save is refused with a
 * 409 instead of silently clobbering the newer version.
 */
export const PUT = handleRoute(async (request: Request, context: RouteContext<Params>) => {
  const { user } = await requireApiUser();
  const { id, fileId } = await context.params;
  const { file } = await loadOwnedFile(user.id, id, fileId);

  const raw = await readJson<Record<string, unknown>>(request);
  const body = updateCodeFileSchema.parse(raw);

  if (body.content.length > MAX_FILE_CONTENT_CHARS) {
    throw new ApiError(413, "That file is too large for Code Studio to store (limit ≈ 600 KB of text).");
  }

  const expected = typeof raw.expectedUpdatedAt === "string" ? new Date(raw.expectedUpdatedAt) : null;
  if (expected && !Number.isNaN(expected.getTime()) && expected.getTime() < file.updatedAt.getTime()) {
    return json(
      {
        ok: false,
        error: {
          message:
            "This file changed on the server after you opened it — probably from another tab or an AI edit. Reload it before saving so you do not overwrite the newer version.",
          code: "stale_write",
          serverUpdatedAt: file.updatedAt,
          yourVersionFrom: expected,
        },
      },
      { status: 409 },
    );
  }

  const unchanged = body.content === file.content;

  const updated = unchanged
    ? file
    : await prisma.codeFile.update({
        where: { id: file.id },
        data: { content: body.content },
        select: SELECT,
      });

  if (!unchanged) {
    await recordUsage({ userId: user.id, kind: "code.file.save", bytes: Buffer.byteLength(updated.content) });
  }

  return ok({ file: serialise(updated), saved: !unchanged, unchanged });
});

/** PATCH /api/projects/:id/code-files/:fileId — move/rename by changing its path. */
export const PATCH = handleRoute(async (request: Request, context: RouteContext<Params>) => {
  const { user } = await requireApiUser();
  const { id, fileId } = await context.params;
  const { project, file } = await loadOwnedFile(user.id, id, fileId);

  const body = renameCodeFileSchema.parse(await readJson(request));
  const checked = validateProjectPath(body.path);
  if (!checked.ok) throw new ApiError(400, checked.message);

  if (checked.value === file.path) return ok({ file: serialise(file), unchanged: true });

  const collision = await prisma.codeFile.findFirst({
    where: { projectId: project.id, userId: user.id, path: checked.value },
    select: { id: true, path: true },
  });
  if (collision) {
    return json(
      {
        ok: false,
        error: {
          message: `“${collision.path}” already exists in this project, so the file was not renamed.`,
          code: "path_exists",
        },
      },
      { status: 409 },
    );
  }

  const updated = await prisma.codeFile.update({
    where: { id: file.id },
    data: { path: checked.value, language: languageFor(checked.value).id },
    select: SELECT,
  });

  return ok({ file: serialise(updated), previousPath: file.path });
});

/** DELETE /api/projects/:id/code-files/:fileId */
export const DELETE = handleRoute(async (_request: Request, context: RouteContext<Params>) => {
  const { user } = await requireApiUser();
  const { id, fileId } = await context.params;
  const { file } = await loadOwnedFile(user.id, id, fileId);

  await prisma.codeFile.delete({ where: { id: file.id } });
  return ok({ deleted: true, id: file.id, path: file.path });
});
