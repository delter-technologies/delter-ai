import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatBytes } from "@/lib/storage";
import { ProjectDetailView } from "@/components/projects/ProjectDetailView";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return { title: "Project" };
  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    select: { name: true },
  });
  return { title: project?.name ?? "Project" };
}

/**
 * One project: its conversations, uploaded files and source files in one place.
 *
 * Ownership is checked here before anything renders, so another user's project id
 * produces the 404 page rather than an empty shell.
 */
export default async function ProjectDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/signin");
  if (!session.user.onboardedAt) redirect("/onboarding");

  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    select: {
      id: true,
      name: true,
      description: true,
      instructions: true,
      kind: true,
      pinned: true,
      createdAt: true,
      updatedAt: true,
      lastOpenedAt: true,
    },
  });
  if (!project) notFound();

  const [conversations, files, codeFiles] = await Promise.all([
    prisma.conversation.findMany({
      where: { projectId: project.id, userId: session.user.id },
      orderBy: { lastMessageAt: "desc" },
      select: {
        id: true,
        title: true,
        kind: true,
        model: true,
        lastMessageAt: true,
        _count: { select: { messages: true } },
      },
    }),
    prisma.fileAsset.findMany({
      where: { projectId: project.id, userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, mimeType: true, size: true, extractable: true, createdAt: true },
    }),
    prisma.codeFile.findMany({
      where: { projectId: project.id, userId: session.user.id },
      orderBy: [{ position: "asc" }, { path: "asc" }],
      select: { id: true, path: true, language: true, updatedAt: true },
    }),
  ]);

  return (
    <ProjectDetailView
      project={{
        id: project.id,
        name: project.name,
        description: project.description,
        instructions: project.instructions,
        kind: project.kind,
        pinned: project.pinned,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
        lastOpenedAt: project.lastOpenedAt?.toISOString() ?? null,
      }}
      conversations={conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        kind: conversation.kind,
        model: conversation.model,
        messageCount: conversation._count.messages,
        lastMessageAt: conversation.lastMessageAt.toISOString(),
      }))}
      files={files.map((file) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        sizeLabel: formatBytes(file.size),
        size: file.size,
        extractable: file.extractable,
        createdAt: file.createdAt.toISOString(),
      }))}
      codeFiles={codeFiles.map((file) => ({
        id: file.id,
        path: file.path,
        language: file.language,
        updatedAt: file.updatedAt.toISOString(),
      }))}
    />
  );
}
