import "server-only";
import { prisma } from "@/lib/db";
import { previewStatus } from "@/lib/code/preview";
import { MAX_FILE_CONTENT_CHARS, MAX_FILES_PER_PROJECT } from "@/lib/code/paths";
import { languageFor } from "@/lib/code/languages";
import { chatPageData } from "./chat-page-data";

/**
 * First-paint data for Code Studio.
 *
 * Everything here is scoped to the session user at the database level: the
 * project is looked up by `{ id, userId }`, and its files by
 * `{ projectId, userId }`, so a `?project=` id belonging to somebody else simply
 * resolves to "no project" and the page falls back to one the user does own.
 *
 * Only the file the editor will open is sent with its contents. The client
 * refetches the full list (`?contents=1`) once mounted, which keeps this
 * payload small for large projects while still painting real code immediately.
 */

export type CodeProjectSummary = {
  id: string;
  name: string;
  kind: string;
  description: string | null;
  instructions: string | null;
  pinned: boolean;
  updatedAt: string;
};

export async function codePageData(
  userId: string,
  userDefaultModel: string | null,
  options: {
    requestedProjectId?: string | null;
    requestedPath?: string | null;
    requestedSessionId?: string | null;
  } = {},
) {
  const projectRows = await prisma.project.findMany({
    where: { userId, archivedAt: null },
    orderBy: [{ pinned: "desc" }, { lastOpenedAt: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      kind: true,
      description: true,
      instructions: true,
      pinned: true,
      updatedAt: true,
      _count: { select: { codeFiles: true } },
    },
  });

  const projects = projectRows.map((project) => ({
    id: project.id,
    name: project.name,
    kind: project.kind,
    description: project.description,
    instructions: project.instructions,
    pinned: project.pinned,
    updatedAt: project.updatedAt.toISOString(),
    codeFileCount: project._count.codeFiles,
  }));

  const requested = options.requestedProjectId
    ? projects.find((project) => project.id === options.requestedProjectId)
    : undefined;
  // A project with code is the most useful default; otherwise the most recent one.
  const project =
    requested ??
    projects.find((candidate) => candidate.codeFileCount > 0) ??
    projects[0] ??
    null;

  if (!project) {
    return {
      projects,
      project: null,
      files: [] as InitialFile[],
      openFile: null,
      preview: null,
      limits: { maxFiles: MAX_FILES_PER_PROJECT, maxFileChars: MAX_FILE_CONTENT_CHARS },
      sessionId: null,
      ai: await chatPageData(userId, userDefaultModel),
    };
  }

  const fileRows = await prisma.codeFile.findMany({
    where: { projectId: project.id, userId },
    orderBy: [{ position: "asc" }, { path: "asc" }],
    select: {
      id: true,
      path: true,
      content: true,
      language: true,
      position: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const files: InitialFile[] = fileRows.map((file) => ({
    id: file.id,
    path: file.path,
    name: file.path.split("/").pop() ?? file.path,
    language: file.language,
    languageLabel: languageFor(file.path).label,
    position: file.position,
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
  }));

  const wanted = options.requestedPath
    ? fileRows.find((file) => file.path === options.requestedPath)
    : undefined;
  const opened = wanted ?? fileRows[0] ?? null;

  // Touch lastOpenedAt so the project switcher order reflects real usage.
  await prisma.project
    .update({ where: { id: project.id }, data: { lastOpenedAt: new Date() }, select: { id: true } })
    .catch(() => null);

  const session = await prisma.conversation.findFirst({
    where: {
      userId,
      projectId: project.id,
      kind: "code",
      // A ?session= id from the URL is only used when it belongs to this user
      // and this project; otherwise fall back to the most recent session.
      ...(options.requestedSessionId ? { id: options.requestedSessionId } : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true },
  });

  const fallbackSession = session
    ? session
    : await prisma.conversation.findFirst({
        where: { userId, projectId: project.id, kind: "code" },
        orderBy: { lastMessageAt: "desc" },
        select: { id: true },
      });

  return {
    projects,
    project: project as CodeProjectSummary & { codeFileCount: number },
    files,
    openFile: opened
      ? {
          id: opened.id,
          path: opened.path,
          language: opened.language,
          content: opened.content,
          updatedAt: opened.updatedAt.toISOString(),
        }
      : null,
    preview: previewStatus(fileRows.map((file) => ({ path: file.path, content: file.content }))),
    limits: { maxFiles: MAX_FILES_PER_PROJECT, maxFileChars: MAX_FILE_CONTENT_CHARS },
    sessionId: fallbackSession?.id ?? null,
    ai: await chatPageData(userId, userDefaultModel),
  };
}

export type InitialFile = {
  id: string;
  path: string;
  name: string;
  language: string;
  languageLabel: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};
