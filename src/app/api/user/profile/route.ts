import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { handleRoute, ok, readJson } from "@/lib/api";
import { updateProfileSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/user/profile — name, display name, purpose, interests. */
export const PATCH = handleRoute(async (request: Request) => {
  const { user } = await requireApiUser();
  const body = updateProfileSchema.parse(await readJson(request));

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
      ...(body.mainPurpose !== undefined ? { mainPurpose: body.mainPurpose } : {}),
      ...(body.interests !== undefined ? { interests: body.interests.length ? body.interests.join(", ") : null } : {}),
    },
    select: { id: true, name: true, displayName: true, mainPurpose: true, interests: true, email: true },
  });

  return ok({
    user: {
      ...updated,
      interests: updated.interests ? updated.interests.split(",").map((s) => s.trim()).filter(Boolean) : [],
    },
  });
});
