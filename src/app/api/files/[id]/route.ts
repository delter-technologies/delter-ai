import { prisma } from "@/lib/db";
import { assertFileOwnership, assertProjectOwnership, requireApiUser, ApiError } from "@/lib/auth";
import { handleRoute, json, ok, readJson } from "@/lib/api";
import { deleteStoredFile, formatBytes, readFileBytes } from "@/lib/storage";
import { moveFileSchema, renameFileSchema } from "@/lib/validation";
import { sanitiseFileName } from "@/lib/storage";
import type { RouteContext } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

/**
 * GET /api/files/:id
 *
 * Streams the stored bytes back with ownership enforced on the row. `?content=1`
 * returns the extracted text for files Delter AI can read — that is what powers
 * the in-app text preview and "use as AI context".
 */
export const GET = handleRoute(async (request: Request, context: RouteContext<Params>) => {
  const { user } = await requireApiUser();
  const { id } = await context.params;

  const file = await assertFileOwnership(user.id, id);
  const url = new URL(request.url);

  if (url.searchParams.get("content") === "1") {
    if (!file.extractable) {
      throw new ApiError(
        415,
        `Delter AI cannot read “${file.name}” as text (${file.mimeType}). It is stored and can be downloaded, but it cannot be used as AI context.`,
      );
    }
    const record = await prisma.fileAsset.findFirst({
      where: { id, userId: user.id },
      select: { textContent: true, size: true, name: true, mimeType: true },
    });
    return ok({
      name: record?.name ?? file.name,
      mimeType: record?.mimeType ?? file.mimeType,
      size: record?.size ?? file.size,
      sizeLabel: formatBytes(record?.size ?? file.size),
      content: record?.textContent ?? "",
      truncated: (record?.textContent ?? "").includes("[Delter AI stored"),
    });
  }

  const bytes = await readFileBytes(file.storagePath);
  if (!bytes) {
    // The row exists but the bytes are gone. Report that plainly instead of
    // serving an empty 200.
    throw new ApiError(
      410,
      `The stored copy of “${file.name}” is missing from storage. Its metadata is still here, but the contents cannot be downloaded.`,
    );
  }

  const download = url.searchParams.get("download") !== "0";

  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": file.mimeType || "application/octet-stream",
      "content-length": String(bytes.length),
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(file.name)}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
});

/** PATCH /api/files/:id — rename, or move into/out of a project. */
export const PATCH = handleRoute(async (request: Request, context: RouteContext<Params>) => {
  const { user } = await requireApiUser();
  const { id } = await context.params;
  const file = await assertFileOwnership(user.id, id);

  const raw = await readJson<Record<string, unknown>>(request);
  const hasProject = "projectId" in raw;

  const data: { name?: string; projectId?: string | null } = {};

  if ("name" in raw) {
    const { name } = renameFileSchema.parse(raw);
    const sanitised = sanitiseFileName(name);
    if (sanitised.blocked) throw new ApiError(400, sanitised.reason ?? "That file name is not allowed.");
    data.name = sanitised.name;
  }

  if (hasProject) {
    const { projectId } = moveFileSchema.parse(raw);
    if (projectId) await assertProjectOwnership(user.id, projectId);
    data.projectId = projectId;
  }

  if (!Object.keys(data).length) throw new ApiError(400, "Nothing to update.");

  const updated = await prisma.fileAsset.update({
    where: { id: file.id },
    data,
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
  });

  return ok({
    file: {
      id: updated.id,
      name: updated.name,
      mimeType: updated.mimeType,
      size: updated.size,
      sizeLabel: formatBytes(updated.size),
      extractable: updated.extractable,
      sha256: updated.sha256,
      projectId: updated.projectId,
      projectName: updated.project?.name ?? null,
      createdAt: updated.createdAt.toISOString(),
    },
  });
});

/**
 * DELETE /api/files/:id
 *
 * Removes the metadata row and the bytes, and detaches it from any conversation
 * context so a later request cannot reference a file that no longer exists.
 */
export const DELETE = handleRoute(async (_request: Request, context: RouteContext<Params>) => {
  const { user } = await requireApiUser();
  const { id } = await context.params;
  const file = await assertFileOwnership(user.id, id);

  const removedFromDisk = await deleteStoredFile(file.storagePath);
  await prisma.fileAsset.delete({ where: { id: file.id } });

  if (!removedFromDisk) {
    return json(
      {
        ok: true,
        data: {
          deleted: true,
          id,
          warning: "The file was removed from Delter AI, but its stored copy was already missing from disk.",
        },
      },
    );
  }

  return ok({ deleted: true, id });
});
