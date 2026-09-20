import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TEMPLATES } from "@/lib/code/templates";
import { ProjectsView } from "@/components/projects/ProjectsView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Projects" };

/**
 * Projects.
 *
 * A project is the container that makes Delter AI coherent: conversations,
 * uploaded files and Code Studio source files all hang off it, and the AI reads
 * the project's description, instructions and file list as context.
 */
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect("/signin");
  if (!session.user.onboardedAt) redirect("/onboarding");

  const params = await searchParams;
  const openCreate = (Array.isArray(params.new) ? params.new[0] : params.new) === "1";

  const projects = await prisma.project.findMany({
    where: { userId: session.user.id, archivedAt: null },
    orderBy: [{ pinned: "desc" }, { lastOpenedAt: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      description: true,
      instructions: true,
      kind: true,
      pinned: true,
      lastOpenedAt: true,
      updatedAt: true,
      createdAt: true,
      _count: { select: { conversations: true, files: true, codeFiles: true } },
    },
  });

  return (
    <ProjectsView
      openCreateInitially={openCreate}
      projects={projects.map((project) => ({
        id: project.id,
        name: project.name,
        description: project.description,
        instructions: project.instructions,
        kind: project.kind,
        pinned: project.pinned,
        lastOpenedAt: project.lastOpenedAt?.toISOString() ?? null,
        updatedAt: project.updatedAt.toISOString(),
        createdAt: project.createdAt.toISOString(),
        counts: {
          conversations: project._count.conversations,
          files: project._count.files,
          codeFiles: project._count.codeFiles,
        },
      }))}
      templates={TEMPLATES.map((template) => ({
        id: template.id,
        label: template.label,
        description: template.description,
        fileCount: template.files.length,
        kind: template.kind,
        paths: template.files.map((file) => file.path),
      }))}
    />
  );
}
