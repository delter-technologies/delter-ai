import { prisma } from "@/lib/db";
import { assertConversationOwnership, assertProjectOwnership, requireApiUser, ApiError } from "@/lib/auth";
import { streamChat } from "@/lib/ai";
import { buildSystemPrompt, trimHistory, truncate, DEFAULT_BUDGET } from "@/lib/ai/context";
import { resolveModel } from "@/lib/ai/registry";
import type { ChatMessage } from "@/lib/ai/types";
import { handleRoute, readJson } from "@/lib/api";
import { chatRequestSchema } from "@/lib/validation";
import { recordUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/ai/stream
 *
 * The one endpoint every conversational surface uses: Chat, project-scoped chat
 * and the Code Studio assistant. It owns:
 *
 *   1. authorisation  — session, then project/conversation/file ownership
 *   2. persistence    — user turn, pending assistant row, final content
 *   3. context        — user profile → project → files → open code → history,
 *                       each layer truncated against a budget
 *   4. provider choice — with an honest fallback that is announced to the client
 *   5. transport      — Server-Sent Events
 *   6. metering       — a UsageEvent per request, success or failure
 *
 * All of that happens before or after the stream is opened; nothing inside the
 * stream needs request-scoped state, which keeps it stable under streaming.
 *
 * Wire protocol:
 *   event: meta   { conversationId, messageId, provider, model, modelLabel, demo, fallbackReason, needsTitle }
 *   event: delta  { text }
 *   event: done   { messageId, text, usage, finishReason, stopped, durationMs, demo, needsTitle }
 *   event: error  { messageId, message, retryable, partial }
 */

/** Above this size a project file is listed by path but not sent in full. */
const MAX_CODE_FILE_CHARS = 14_000;
/** How many project files are sent in full before the budget takes over. */
const MAX_INLINE_CODE_FILES = 12;

export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireApiUser();
  const body = chatRequestSchema.parse(await readJson(request));

  /* ------------------------------------------------------------------ */
  /* 1. Resolve the conversation                                         */
  /* ------------------------------------------------------------------ */

  let conversationId: string = body.conversationId ?? "";

  if (conversationId) {
    await assertConversationOwnership(user.id, conversationId);
  } else {
    if (body.projectId) await assertProjectOwnership(user.id, body.projectId);
    const created = await prisma.conversation.create({
      data: {
        userId: user.id,
        projectId: body.projectId ?? null,
        kind: body.kind,
        title: body.kind === "code" ? "Code Studio session" : "New chat",
        model: body.model ?? user.defaultModel,
      },
      select: { id: true },
    });
    conversationId = created.id;
  }

  const conversation = await prisma.conversation.findFirstOrThrow({
    where: { id: conversationId, userId: user.id },
    select: { id: true, projectId: true, kind: true, model: true, title: true },
  });

  /* ------------------------------------------------------------------ */
  /* 2. Persist the user turn (or prepare a retry)                       */
  /* ------------------------------------------------------------------ */

  const isRetry = Boolean(body.retryMessageId);
  let userMessageId: string;

  if (isRetry) {
    const failed = await prisma.message.findFirst({
      where: {
        id: body.retryMessageId!,
        conversationId: conversation.id,
        userId: user.id,
        role: "assistant",
      },
      select: { id: true, createdAt: true },
    });
    if (!failed) throw new ApiError(404, "That response could not be found, so it cannot be retried.");

    const preceding = await prisma.message.findFirst({
      where: {
        conversationId: conversation.id,
        userId: user.id,
        role: "user",
        createdAt: { lte: failed.createdAt },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!preceding) throw new ApiError(400, "There is no message to retry — send a new one instead.");

    // Remove the failed turn so the retry replaces it instead of stacking.
    await prisma.message.delete({ where: { id: failed.id } });
    userMessageId = preceding.id;
  } else {
    const created = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        userId: user.id,
        role: "user",
        content: body.content,
        model: body.model ?? conversation.model,
      },
      select: { id: true },
    });
    userMessageId = created.id;
  }

  /* ------------------------------------------------------------------ */
  /* 3. Record explicitly attached files as context                      */
  /* ------------------------------------------------------------------ */

  if (body.fileIds.length) {
    const owned = await prisma.fileAsset.findMany({
      where: { id: { in: body.fileIds }, userId: user.id },
      select: { id: true },
    });
    if (owned.length !== new Set(body.fileIds).size) {
      throw new ApiError(404, "One or more of those files could not be found in your account.");
    }
    const alreadyAttached = new Set(
      (
        await prisma.conversationFile.findMany({
          where: { conversationId: conversation.id, fileId: { in: owned.map((file) => file.id) } },
          select: { fileId: true },
        })
      ).map((link) => link.fileId),
    );

    for (const file of owned) {
      if (alreadyAttached.has(file.id)) continue;
      await prisma.conversationFile.create({
        data: { conversationId: conversation.id, fileId: file.id },
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* 4. Load everything the model is allowed to see                      */
  /* ------------------------------------------------------------------ */

  const wantProjectFiles = conversation.kind === "code" || Boolean(body.code?.includeProjectFiles);

  const [project, history, attachedLinks, projectCodeFiles, storedOpenFile] = await Promise.all([
    conversation.projectId
      ? prisma.project.findFirst({
          where: { id: conversation.projectId, userId: user.id },
          select: { id: true, name: true, description: true, instructions: true, kind: true },
        })
      : Promise.resolve(null),

    prisma.message.findMany({
      where: { conversationId: conversation.id, userId: user.id },
      orderBy: { createdAt: "asc" },
      take: 60,
      select: { id: true, role: true, content: true, pending: true },
    }),

    prisma.conversationFile.findMany({
      where: { conversationId: conversation.id },
      select: {
        file: { select: { id: true, name: true, mimeType: true, textContent: true, size: true } },
      },
    }),

    conversation.projectId && wantProjectFiles
      ? prisma.codeFile.findMany({
          where: { projectId: conversation.projectId, userId: user.id },
          orderBy: [{ position: "asc" }, { path: "asc" }],
          select: { path: true, language: true, content: true },
        })
      : Promise.resolve([]),

    body.code?.openFilePath && conversation.projectId
      ? prisma.codeFile.findFirst({
          where: { projectId: conversation.projectId, userId: user.id, path: body.code.openFilePath },
          select: { path: true, content: true, language: true },
        })
      : Promise.resolve(null),
  ]);

  const messages: ChatMessage[] = history
    // A row left `pending` by an aborted earlier request carries no content.
    .filter((message) => !(message.role === "assistant" && message.pending))
    .map((message) => ({
      role: message.role === "assistant" ? ("assistant" as const) : message.role === "system" ? ("system" as const) : ("user" as const),
      content: message.content,
    }));

  const budget = DEFAULT_BUDGET;
  const trimmedHistory = trimHistory(messages, budget);

  const inlineFiles = projectCodeFiles
    .filter((file) => file.content.length <= MAX_CODE_FILE_CHARS)
    .slice(0, MAX_INLINE_CODE_FILES);

  const systemPrompt = buildSystemPrompt({
    surface: conversation.kind === "code" ? "code" : "chat",
    user: {
      displayName: user.displayName,
      name: user.name,
      mainPurpose: user.mainPurpose,
      interests: user.interests,
    },
    project: project
      ? {
          name: project.name,
          description: project.description,
          instructions: project.instructions,
          kind: project.kind,
          filePaths: projectCodeFiles.map((file) => file.path),
          files: inlineFiles.map((file) => ({ path: file.path, language: file.language, content: file.content })),
        }
      : null,
    attachedFiles: attachedLinks.map((link) => ({
      name: link.file.name,
      mimeType: link.file.mimeType,
      content: link.file.textContent ? truncate(link.file.textContent, budget.perFile, link.file.name) : null,
    })),
    code: body.code
      ? {
          openFilePath: storedOpenFile?.path ?? body.code.openFilePath ?? null,
          // Prefer the persisted version: the model then sees what is actually
          // saved, not whatever the client happened to send.
          openFileContent: storedOpenFile
            ? truncate(storedOpenFile.content, MAX_CODE_FILE_CHARS * 2, storedOpenFile.path)
            : (body.code.openFileContent ?? null),
          openFileLanguage: storedOpenFile?.language ?? body.code.openFileLanguage ?? null,
          selectedCode: body.code.selectedCode ?? null,
        }
      : null,
    budget,
  });

  /* ------------------------------------------------------------------ */
  /* 5. Choose provider + model                                          */
  /* ------------------------------------------------------------------ */

  const { provider, model, fellBack, reason: fallbackReason } = resolveModel(
    body.model ?? conversation.model,
    user.defaultModel,
  );

  const assistantMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      userId: user.id,
      role: "assistant",
      content: "",
      pending: true,
      provider: provider.id,
      model: model.id,
    },
    select: { id: true },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), provider: provider.id, model: model.id },
  });

  const isDemo = provider.id === "delter-demo";
  const needsTitle =
    !isRetry &&
    (conversation.title === "New chat" || conversation.title === "Code Studio session") &&
    messages.filter((message) => message.role === "user").length <= 1;

  /* ------------------------------------------------------------------ */
  /* 6. Stream                                                           */
  /* ------------------------------------------------------------------ */

  const encoder = new TextEncoder();
  const controller = new AbortController();
  // If the browser navigates away or the user presses Stop, stop burning tokens.
  request.signal.addEventListener("abort", () => controller.abort());

  const startedAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(writable) {
      const send = (event: string, data: unknown) => {
        try {
          writable.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // The client is gone; abort so the provider call stops too.
          controller.abort();
        }
      };

      send("meta", {
        conversationId: conversation.id,
        messageId: assistantMessage.id,
        userMessageId,
        provider: provider.id,
        providerLabel: provider.label,
        model: model.id,
        modelLabel: model.label,
        demo: isDemo,
        fallback: fellBack,
        fallbackReason: fellBack ? (fallbackReason ?? null) : null,
        needsTitle,
        retry: isRetry,
      });

      const result = await streamChat({
        provider,
        model,
        messages: trimmedHistory,
        system: systemPrompt,
        signal: controller.signal,
        meta: {
          surface: conversation.kind,
          projectId: conversation.projectId,
          projectName: project?.name ?? null,
          openFilePath: body.code?.openFilePath ?? null,
          openFileLanguage: body.code?.openFileLanguage ?? null,
          // The stored copy, not whatever the client sent — and only ever read by
          // the offline demo provider. Live providers ignore `meta`; it is never
          // transmitted to a third party.
          openFileContent: storedOpenFile ? storedOpenFile.content.slice(0, 24_000) : null,
          selectionText: body.code?.selectedCode ? body.code.selectedCode.slice(0, 8_000) : null,
          projectFileCount: projectCodeFiles.length,
          attachedFileCount: attachedLinks.length,
          selection: body.code?.selectedCode ? true : false,
        },
        onDelta: (text) => send("delta", { text }),
      });

      const durationMs = Date.now() - startedAt;

      // Persist whatever actually happened. A partial answer after Stop is still
      // the honest record of what was produced.
      try {
        await prisma.message.update({
          where: { id: assistantMessage.id },
          data: {
            content: result.text,
            pending: false,
            error: result.error?.message ?? null,
            promptTokens: result.usage.inputTokens ?? null,
            completionTokens: result.usage.outputTokens ?? null,
            totalTokens: result.usage.totalTokens ?? null,
            durationMs,
          },
        });
      } catch (error) {
        console.error("[delter-ai] failed to persist assistant message:", error);
      }

      await prisma.conversation
        .update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } })
        .catch(() => {});

      await recordUsage({
        userId: user.id,
        kind: "ai.request",
        provider: provider.id,
        model: model.id,
        usage: result.usage,
        status: result.error ? "error" : "success",
        error: result.error?.message ?? null,
      });

      if (result.error) {
        send("error", {
          messageId: assistantMessage.id,
          message: result.error.message,
          retryable: result.error.retryable,
          partial: result.text.length > 0,
          demo: isDemo,
        });
      } else {
        send("done", {
          messageId: assistantMessage.id,
          conversationId: conversation.id,
          text: result.text,
          usage: result.usage,
          finishReason: result.finishReason,
          stopped: Boolean(result.aborted),
          durationMs,
          demo: isDemo,
          needsTitle,
        });
      }

      try {
        writable.close();
      } catch {
        /* already closed */
      }
    },
    cancel() {
      controller.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      // Disable proxy buffering so tokens reach the browser as they arrive.
      "x-accel-buffering": "no",
      "x-delter-provider": provider.id,
      "x-delter-model": model.id,
      "x-delter-demo": isDemo ? "1" : "0",
    },
  });
});
