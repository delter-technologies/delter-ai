import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatBytes } from "@/lib/storage";
import { FilesView } from "@/components/files/FilesView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Files" };

/**
 * Files.
 *
 * A real file system experience: uploads are written to disk and hashed before a
 * metadata row exists, previews read the extracted text, downloads stream the
 * stored bytes, and deletes remove both. Text-based files can be attached to a
 * conversation as AI context; binaries are stored and downloadable, and the UI
 * says plainly that they cannot be read.
 */
export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect("/signin");
  if (!session.user.onboardedAt) redirect("/onboarding");

  const params = await searchParams;
  const pick = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
  };

  const projectId = pick("project");

  // Verify the project belongs to this user before filtering by it.
  const scopedProject = projectId
    ? await prisma.project.findFirst({
        where: { id: projectId, userId: session.user.id },
        select: { id: true, name: true },
      })
    : null;

  const [files, projects, aggregate] = await Promise.all([
    prisma.fileAsset.findMany({
      where: { userId: session.user.id, ...(scopedProject ? { projectId: scopedProject.id } : {}) },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true,
        name: true,
        mimeType: true,
        size: true,
        extractable: true,
        sha256: true,
        projectId: true,
        createdAt: true,
        project: { select: { id: true, name: true } },
      },
    }),
    prisma.project.findMany({
      where: { userId: session.user.id, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.fileAsset.aggregate({
      where: { userId: session.user.id },
      _sum: { size: true },
      _count: { _all: true },
    }),
  ]);

  return (
    <FilesView
      initialFiles={files.map((file) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        sizeLabel: formatBytes(file.size),
        extractable: file.extractable,
        sha256: file.sha256,
        projectId: file.projectId,
        projectName: file.project?.name ?? null,
        createdAt: file.createdAt.toISOString(),
      }))}
      projects={projects}
      scopedProject={scopedProject}
      totals={{ count: aggregate._count._all, bytes: aggregate._sum.size ?? 0, label: formatBytes(aggregate._sum.size ?? 0) }}
      openUploadInitially={pick("upload") === "1"}
      openFileId={pick("file")}
    />
  );
}
