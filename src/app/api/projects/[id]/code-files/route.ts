import { prisma } from "@/lib/db";
import { assertProjectOwnership, requireApiUser, ApiError } from "@/lib/auth";
import { handleRoute, json, ok, readJson } from "@/lib/api";
import { createCodeFileSchema } from "@/lib/validation";
import { validateProjectPath, MAX_FILES_PER_PROJECT, MAX_FILE_CONTENT_CHARS } from "@/lib/code/paths";
import { languageFor } from "@/lib/code/languages";
import { previewStatus, type PreviewCodeFile } from "@/lib/code/preview";
import { recordUsage } from "@/lib/usage";
import type { RouteContext } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

const FILE_SELECT = {
  id: true,
  path: true,
  language: true,
  position: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * GET /api/projects/:id/code-files?contents=1
 *
 * Without `contents=1` this returns metadata only — that is what the explorer
 * tree needs, and it keeps the payload small for large projects. The editor
 * fetches a single file's contents separately.
 */
export const GET = handleRoute(async (request: Request, context: RouteContext<Params>) => {
  const { user } = await requireApiUser();
  const { id } = await context.params;

  const project = await assertProjectOwnership(user.id, id);
  const includeContents = new URL(request.url).searchParams.get("contents") === "1";

  const where = { projectId: project.id, userId: user.id };
  const orderBy = [{ position: "asc" as const }, { path: "asc" as const }];

  const files = includeContents
    ? await prisma.codeFile.findMany({ where, orderBy, select: { ...FILE_SELECT, content: true } })
    : await prisma.codeFile.findMany({ where, orderBy, select: FILE_SELECT });

  const withContents = files as (typeof files[number] & { content?: string })[];

  const previewFiles: PreviewCodeFile[] = withContents.map((file) => ({
    path: file.path,
    content: file.content ?? "",
  }));

  return ok({
    projectId: project.id,
    projectName: project.name,
    projectKind: project.kind,
    files: withContents.map((file) => ({
      id: file.id,
      path: file.path,
      name: file.path.split("/").pop() ?? file.path,
      language: file.language,
      languageLabel: languageFor(file.path).label,
      position: file.position,
      updatedAt: file.updatedAt,
      createdAt: file.createdAt,
      ...(file.content !== undefined ? { content: file.content } : {}),
    })),
    // Preview support is reported from the real file list, so the Preview tab can
    // say precisely why it can or cannot render.
    preview: includeContents ? previewStatus(previewFiles) : null,
    limits: { maxFiles: MAX_FILES_PER_PROJECT, maxFileChars: MAX_FILE_CONTENT_CHARS },
  });
});

/**
 * POST /api/projects/:id/code-files
 *
 * Creates a file. A path collision is a 409 that names the existing file rather
 * than an overwrite, so an accidental duplicate cannot destroy work.
 */
export const POST = handleRoute(async (request: Request, context: RouteContext<Params>) => {
  const { user } = await requireApiUser();
  const { id } = await context.params;

  const project = await assertProjectOwnership(user.id, id);
  const body = createCodeFileSchema.parse(await readJson(request));

  const checked = validateProjectPath(body.path);
  if (!checked.ok) throw new ApiError(400, checked.message);

  if (body.content.length > MAX_FILE_CONTENT_CHARS) {
    throw new ApiError(413, "That file is too large for Code Studio to store (limit ≈ 600 KB of text).");
  }

  const count = await prisma.codeFile.count({ where: { projectId: project.id, userId: user.id } });
  if (count >= MAX_FILES_PER_PROJECT) {
    throw new ApiError(409, `This project already has ${MAX_FILES_PER_PROJECT} files, which is the Code Studio limit. Delete one first.`);
  }

  const duplicate = await prisma.codeFile.findFirst({
    where: { projectId: project.id, userId: user.id, path: checked.value },
    select: { id: true, path: true, updatedAt: true },
  });
  if (duplicate) {
    return json(
      {
        ok: false,
        error: {
          message: `A file named “${duplicate.path}” already exists in this project. Open it instead, or choose a different path.`,
          code: "path_exists",
          existing: duplicate,
        },
      },
      { status: 409 },
    );
  }

  const language = languageFor(checked.value).id;

  const file = await prisma.codeFile.create({
    data: {
      projectId: project.id,
      userId: user.id,
      path: checked.value,
      content: body.content ?? "",
      language,
      position: count,
    },
    select: { ...FILE_SELECT, content: true },
  });

  await recordUsage({ userId: user.id, kind: "code.file.create", bytes: Buffer.byteLength(file.content) });

  return ok({
    file: {
      id: file.id,
      path: file.path,
      name: file.path.split("/").pop() ?? file.path,
      language: file.language,
      languageLabel: languageFor(file.path).label,
      content: file.content,
      position: file.position,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    },
  });
});
