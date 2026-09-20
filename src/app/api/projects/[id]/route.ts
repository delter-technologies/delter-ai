import { prisma } from "@/lib/db";
import { assertProjectOwnership, requireApiUser } from "@/lib/auth";
import { handleRoute, ok, readJson } from "@/lib/api";
import { updateProjectSchema } from "@/lib/validation";
import { TEMPLATES, getTemplate } from "@/lib/code/templates";
import { languageFor } from "@/lib/code/languages";
import { MAX_FILES_PER_PROJECT } from "@/lib/code/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

const SELECT = {
  id: true,
  name: true,
  description: true,
  instructions: true,
  kind: true,
  pinned: true,
  archivedAt: true,
  lastOpenedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { conversations: true, files: true, codeFiles: true } },
} as const;

/**
 * GET /api/projects/:id
 *
 * Also records the "opened" timestamp so the dashboard's Recent projects list is
 * genuinely recent rather than merely recently edited.
 */
export const GET = handleRoute(async (_request: Request, context: { params: Promise<Params> }) => {
  const { user } = await requireApiUser();
  const { id } = await context.params;

  // Ownership is asserted BEFORE anything is written, so a guessed project id
  // cannot even update a timestamp on someone else's row.
  await assertProjectOwnership(user.id, id);

  const project = await prisma.project.update({
    where: { id },
    data: { lastOpenedAt: new Date() },
    select: SELECT,
  });

  const [codeFiles, files, conversations] = await Promise.all([
    prisma.codeFile.findMany({
      where: { projectId: id, userId: user.id },
      orderBy: [{ position: "asc" }, { path: "asc" }],
      select: { id: true, path: true, language: true, updatedAt: true, position: true },
    }),
    prisma.fileAsset.findMany({
      where: { projectId: id, userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, name: true, mimeType: true, size: true, extractable: true, createdAt: true },
    }),
    prisma.conversation.findMany({
      where: { projectId: id, userId: user.id },
      orderBy: { lastMessageAt: "desc" },
      take: 20,
      select: { id: true, title: true, kind: true, lastMessageAt: true, model: true },
    }),
  ]);

  return ok({
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      instructions: project.instructions,
      kind: project.kind,
      pinned: project.pinned,
      archivedAt: project.archivedAt,
      lastOpenedAt: project.lastOpenedAt,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      counts: {
        conversations: project._count.conversations,
        files: project._count.files,
        codeFiles: project._count.codeFiles,
      },
    },
    codeFiles: codeFiles.map((file) => ({ ...file, languageLabel: languageFor(file.path).label })),
    files,
    conversations,
    templates: TEMPLATES.map((template) => ({
      id: template.id,
      label: template.label,
      description: template.description,
      fileCount: template.files.length,
    })),
  });
});

/** PATCH /api/projects/:id — rename, describe, re-instruct, pin, archive. */
export const PATCH = handleRoute(async (request: Request, context: { params: Promise<Params> }) => {
  const { user } = await requireApiUser();
  const { id } = await context.params;
  await assertProjectOwnership(user.id, id);

  const body = updateProjectSchema.parse(await readJson(request));

  const project = await prisma.project.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.instructions !== undefined ? { instructions: body.instructions } : {}),
      ...(body.kind !== undefined ? { kind: body.kind } : {}),
      ...(body.pinned !== undefined ? { pinned: body.pinned } : {}),
    },
    select: SELECT,
  });

  return ok({
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      instructions: project.instructions,
      kind: project.kind,
      pinned: project.pinned,
      archivedAt: project.archivedAt,
      lastOpenedAt: project.lastOpenedAt,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      counts: {
        conversations: project._count.conversations,
        files: project._count.files,
        codeFiles: project._count.codeFiles,
      },
    },
  });
});

/** DELETE /api/projects/:id — cascade removes conversations, messages and code files. */
export const DELETE = handleRoute(async (_request: Request, context: { params: Promise<Params> }) => {
  const { user } = await requireApiUser();
  const { id } = await context.params;
  const project = await assertProjectOwnership(user.id, id);

  // Uploaded FileAssets point at the project with onDelete: SetNull, so the
  // files themselves survive; only the association is dropped.
  await prisma.project.delete({ where: { id: project.id } });

  return ok({ deleted: true, id });
});
