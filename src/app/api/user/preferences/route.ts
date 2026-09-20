import { prisma } from "@/lib/db";
import { requireApiUser, ApiError } from "@/lib/auth";
import { handleRoute, ok, readJson } from "@/lib/api";
import { updatePreferencesSchema } from "@/lib/validation";
import { findModel } from "@/lib/ai/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/user/preferences — theme and default model.
 *
 * The default model is validated against the registry, so a typo cannot leave
 * the account pointing at a model that does not exist. A model whose provider
 * has no key is still allowed (it may be configured later); `resolveModel`
 * handles falling back at request time.
 */
export const PATCH = handleRoute(async (request: Request) => {
  const { user } = await requireApiUser();
  const body = updatePreferencesSchema.parse(await readJson(request));

  if (body.defaultModel && !findModel(body.defaultModel)) {
    throw new ApiError(400, "Delter AI does not recognise that model. Choose one from the model list.");
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(body.theme !== undefined ? { theme: body.theme } : {}),
      ...(body.defaultModel !== undefined ? { defaultModel: body.defaultModel } : {}),
    },
    select: { theme: true, defaultModel: true },
  });

  return ok({ preferences: updated });
});
