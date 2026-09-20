import { prisma } from "@/lib/db";
import { assertProjectOwnership, requireApiUser, ApiError } from "@/lib/auth";
import { handleRoute, ok } from "@/lib/api";
import { config, newId } from "@/lib/config";
import { formatBytes, isTextFile, sanitiseFileName, storeFile } from "@/lib/storage";
import { recordUsage } from "@/lib/usage";
import { ensureRuntimeDirs } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/files?projectId=…&limit=…   — list metadata (never contents)
 * POST /api/files                       — multipart upload, real bytes to disk
 *
 * A FileAsset row is created only after the bytes are confirmed on disk, so the
 * product never reports a successful upload that did not happen.
 */

const FILE_SELECT = {
  id: true,
  name: true,
  mimeType: true,
  size: true,
  extractable: true,
  sha256: true,
  projectId: true,
  createdAt: true,
  project: { select: { id: true, name: true } },
} as const;

export type FileListItem = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  sizeLabel: string;
  extractable: boolean;
  sha256: string | null;
  projectId: string | null;
  projectName: string | null;
  createdAt: string;
};

export function serialiseFile(file: {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  extractable: boolean;
  sha256: string | null;
  projectId: string | null;
  createdAt: Date;
  project: { id: string; name: string } | null;
}): FileListItem {
  return {
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
  };
}

export const GET = handleRoute(async (request: Request) => {
  const { user } = await requireApiUser();
  const url = new URL(request.url);

  const projectId = url.searchParams.get("projectId");
  if (projectId) await assertProjectOwnership(user.id, projectId);

  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 200), 1), 500);
  const query = url.searchParams.get("q")?.trim();

  const files = await prisma.fileAsset.findMany({
    where: {
      userId: user.id,
      ...(projectId ? { projectId } : {}),
      ...(query ? { name: { contains: query } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: FILE_SELECT,
  });

  const total = await prisma.fileAsset.aggregate({
    where: { userId: user.id },
    _sum: { size: true },
    _count: { _all: true },
  });

  return ok({
    files: files.map(serialiseFile),
    totals: {
      count: total._count._all,
      bytes: total._sum.size ?? 0,
      label: formatBytes(total._sum.size ?? 0),
    },
    textExtractable: files.filter((file) => file.extractable).length,
  });
});

export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireApiUser();

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw new ApiError(415, "Uploads must be sent as multipart form data.");
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > config.maxUploadBytes + 1024) {
    throw new ApiError(
      413,
      `That file is larger than the ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB limit. Compress it, or upload it in parts.`,
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError(400, "Delter AI could not read that upload. Please try again.");
  }

  const uploaded = form.getAll("files").filter((entry): entry is File => entry instanceof File);
  if (!uploaded.length) {
    const single = form.get("file");
    if (single instanceof File) uploaded.push(single);
  }
  if (!uploaded.length) throw new ApiError(400, "No file was included in that upload.");
  if (uploaded.length > 20) throw new ApiError(400, "Upload up to 20 files at a time.");

  const projectId = typeof form.get("projectId") === "string" ? (form.get("projectId") as string) : null;
  if (projectId) await assertProjectOwnership(user.id, projectId);

  await ensureRuntimeDirs();

  const results: { file?: FileListItem; error?: { name: string; message: string } }[] = [];

  for (const entry of uploaded) {
    const sanitised = sanitiseFileName(entry.name);

    if (sanitised.blocked) {
      results.push({ error: { name: sanitised.name, message: sanitised.reason! } });
      continue;
    }
    if (entry.size === 0) {
      results.push({ error: { name: sanitised.name, message: "That file is empty, so there was nothing to upload." } });
      continue;
    }
    if (entry.size > config.maxUploadBytes) {
      results.push({
        error: {
          name: sanitised.name,
          message: `${sanitised.name} is ${formatBytes(entry.size)}, over the ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB limit.`,
        },
      });
      continue;
    }

    let bytes: Buffer;
    try {
      bytes = Buffer.from(await entry.arrayBuffer());
    } catch {
      results.push({ error: { name: sanitised.name, message: "Delter AI could not read that file's contents." } });
      continue;
    }

    const fileId = newId("file");
    const mimeType = entry.type || guessMime(sanitised.name);

    let stored;
    try {
      stored = await storeFile(user.id, fileId, bytes, {
        name: sanitised.name,
        ext: sanitised.ext,
        mimeType,
      });
    } catch (error) {
      console.error("[delter-ai] file write failed:", error);
      results.push({
        error: { name: sanitised.name, message: "The file could not be saved to storage. Please retry." },
      });
      continue;
    }

    const record = await prisma.fileAsset.create({
      data: {
        id: fileId,
        userId: user.id,
        projectId,
        name: sanitised.name,
        storagePath: stored.storagePath,
        mimeType,
        size: stored.size,
        sha256: stored.sha256,
        extractable: stored.extractable,
        textContent: stored.textContent,
      },
      select: FILE_SELECT,
    });

    await recordUsage({ userId: user.id, kind: "file.upload", bytes: stored.size });
    results.push({ file: serialiseFile(record) });
  }

  const succeeded = results.filter((result) => result.file).length;
  const failed = results.filter((result) => result.error).length;

  return ok({
    uploaded: results.map((result) => result.file).filter(Boolean) as FileListItem[],
    failures: results.map((result) => result.error).filter(Boolean) as { name: string; message: string }[],
    succeeded,
    failed,
    // Some succeeded, some did not → 207-style partial result surfaced in-band
    // rather than as a blanket success.
    partial: succeeded > 0 && failed > 0,
  });
});

/** Fallback MIME detection when the browser sends an empty type. */
function guessMime(name: string): string {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  const map: Record<string, string> = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".json": "application/json",
    ".html": "text/html",
    ".htm": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".ts": "text/plain",
    ".tsx": "text/plain",
    ".py": "text/plain",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".zip": "application/zip",
  };
  return map[ext] ?? (isTextFile(name, null) ? "text/plain" : "application/octet-stream");
}
