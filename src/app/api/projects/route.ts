import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { handleRoute, ok, readJson } from "@/lib/api";
import { createProjectSchema } from "@/lib/validation";
import { getTemplate } from "@/lib/code/templates";
import { languageFor } from "@/lib/code/languages";
import { recordUsage } from "@/lib/usage";
import { MAX_FILES_PER_PROJECT } from "@/lib/code/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROJECT_SELECT = {
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

export type ProjectListItem = ReturnType<typeof serialiseProject>;

function serialiseProject(project: {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  kind: string;
  pinned: boolean;
  archivedAt: Date | null;
  lastOpenedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { conversations: number; files: number; codeFiles: number };
}) {
  return {
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
  };
}

/**
 * GET /api/projects?archived=1&limit=50
 * Every query is scoped by `userId` — there is no code path that lists projects
 * without it.
 */
export const GET = handleRoute(async (request: Request) => {
  const { user } = await requireApiUser();
  const url = new URL(request.url);
  const includeArchived = url.searchParams.get("archived") === "1";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100), 1), 200);

  const projects = await prisma.project.findMany({
    where: { userId: user.id, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ pinned: "desc" }, { lastOpenedAt: "desc" }, { updatedAt: "desc" }],
    take: limit,
    select: PROJECT_SELECT,
  });

  return ok({ projects: projects.map(serialiseProject) });
});

/**
 * POST /api/projects
 *
 * Creating from a template writes real Code Studio files in the same
 * transaction, so the project is immediately usable rather than an empty shell.
 */
export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireApiUser();
  const raw = await readJson<Record<string, unknown>>(request);
  const body = createProjectSchema.parse(raw);
  const rawKind = typeof raw.kind === "string" ? body.kind : null;

  const template = body.template ? getTemplate(body.template) : undefined;

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      name: body.name,
      description: body.description ?? template?.projectDescription ?? null,
      instructions: body.instructions ?? null,
      // `body.kind` has a schema default, so it is always present; only honour a
      // template's kind when the caller did not choose one explicitly.
      kind: rawKind ?? template?.kind ?? body.kind,
      lastOpenedAt: new Date(),
      ...(template?.files.length
        ? {
            codeFiles: {
              create: template.files.slice(0, MAX_FILES_PER_PROJECT).map((file, index) => ({
                userId: user.id,
                path: file.path,
                content: file.content,
                language: file.language ?? languageFor(file.path).id,
                position: index,
              })),
            },
          }
        : {}),
    },
    select: PROJECT_SELECT,
  });

  await recordUsage({ userId: user.id, kind: "project.create" });

  return ok({ project: serialiseProject(project), templateApplied: template?.id ?? null });
});
