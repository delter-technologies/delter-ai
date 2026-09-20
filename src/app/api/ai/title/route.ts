import { prisma } from "@/lib/db";
import { assertConversationOwnership, requireApiUser } from "@/lib/auth";
import { streamChat } from "@/lib/ai";
import { buildSystemPrompt, LIGHT_BUDGET } from "@/lib/ai/context";
import { resolveModel } from "@/lib/ai/registry";
import { handleRoute, ok, readJson } from "@/lib/api";
import { recordUsage } from "@/lib/usage";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/title
 *
 * Names a conversation from its first exchange. Titles are what make a history
 * list usable, so this runs as its own cheap call rather than blocking the
 * user's first response.
 *
 * Honesty rule: when no provider is configured the model cannot be asked, so the
 * title is derived from the user's own words and marked `generated: false`. The
 * UI shows it as an automatic title, never as something a model wrote.
 */
const schema = z.object({ conversationId: z.string().min(1) });

export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireApiUser();
  const { conversationId } = schema.parse(await readJson(request));
  await assertConversationOwnership(user.id, conversationId);

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId: user.id },
    include: { project: { select: { name: true } } },
  });
  if (!conversation) return ok({ title: null, generated: false, reason: "not_found" });

  const messages = await prisma.message.findMany({
    where: { conversationId, userId: user.id, role: "user" },
    orderBy: { createdAt: "asc" },
    take: 2,
    select: { content: true },
  });
  if (!messages.length) return ok({ title: conversation.title, generated: false, reason: "no_messages" });

  const firstPrompt = messages[0].content;
  const fallbackTitle = deriveTitle(firstPrompt, conversation.project?.name ?? null);

  const { provider, model } = resolveModel(conversation.model, user.defaultModel);

  // The demo provider cannot write a title, so skip the call entirely and say so.
  if (provider.id === "delter-demo") {
    if (conversation.title !== fallbackTitle) {
      await prisma.conversation.update({ where: { id: conversationId }, data: { title: fallbackTitle } });
    }
    return ok({ title: fallbackTitle, generated: false, reason: "offline", provider: provider.id });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const result = await streamChat({
      provider,
      model,
      signal: controller.signal,
      system: buildSystemPrompt({
        surface: "title",
        project: conversation.project ? { name: conversation.project.name } : null,
        budget: LIGHT_BUDGET,
      }),
      messages: [{ role: "user", content: firstPrompt.slice(0, 1_200) }],
      maxTokens: 24,
      temperature: 0.3,
    });

    await recordUsage({
      userId: user.id,
      kind: "ai.title",
      provider: provider.id,
      model: model.id,
      usage: result.usage,
      status: result.error ? "error" : "success",
      error: result.error?.message ?? null,
    });

    const title = cleanTitle(result.text) ?? fallbackTitle;
    await prisma.conversation.update({ where: { id: conversationId }, data: { title } });

    return ok({ title, generated: Boolean(!result.error && cleanTitle(result.text)), provider: provider.id });
  } catch (error) {
    console.error("[delter-ai] title generation failed:", error);
    await prisma.conversation.update({ where: { id: conversationId }, data: { title: fallbackTitle } }).catch(() => {});
    return ok({ title: fallbackTitle, generated: false, reason: "error" });
  } finally {
    clearTimeout(timeout);
  }
});

function cleanTitle(raw: string): string | null {
  const cleaned = raw
    .replace(/^["'`\s]+|["'`\s]+$/g, "")
    .replace(/^(title|conversation title)\s*[:\-]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  const firstLine = cleaned.split(/\n/)[0].slice(0, 60).trim();
  return firstLine || null;
}

/** Deterministic title from the user's own words — used when no model is available. */
function deriveTitle(prompt: string, projectName: string | null): string {
  const clean = prompt.replace(/\s+/g, " ").trim();
  if (!clean) return projectName ? `${projectName} session` : "New chat";

  // Prefer a natural sentence boundary near the start.
  const sentenceEnd = clean.slice(0, 60).search(/[.!?]\s/);
  const base = sentenceEnd > 12 ? clean.slice(0, sentenceEnd + 1) : clean.slice(0, 48);

  const words = base.split(" ");
  let title = words.slice(0, 6).join(" ");
  if (words.length > 6) title = `${title.replace(/[,;:]+$/, "")}…`;

  // Capitalise the first letter without changing the rest of the user's casing.
  title = title.charAt(0).toUpperCase() + title.slice(1);
  return title.slice(0, 60) || "New chat";
}
