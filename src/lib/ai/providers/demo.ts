import type { AiProvider, ModelInfo, ProviderRequest, StreamChunk } from "../types";

const MODEL_ID = "delter-demo";

/**
 * The Delter Demo provider.
 *
 * HONESTY CONTRACT — read before changing this file:
 * This is NOT a language model. It is a deterministic, offline responder whose
 * only job is to make every part of Delter AI genuinely exercisable when no
 * provider key is present: streaming, persistence, retries, error states,
 * context assembly, project awareness, file awareness and Code Studio actions.
 *
 * It never pretends to be a real model. Every response states plainly that it is
 * offline, and `models()` marks it as such so the UI can badge it. The moment a
 * real key is added to `.env`, the registry prefers it and this provider is only
 * used if the user explicitly picks it.
 */
function summarize(text: string, max = 220): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

function bullet(items: string[]): string {
  return items.filter(Boolean).map((i) => `• ${i}`).join("\n");
}

/** Neutralise fences inside quoted material so they cannot read as proposals. */
function quoteSafe(text: string): string {
  return text.replace(/`{3,}/g, (match) => "'".repeat(match.length));
}

const FENCE_BY_LANGUAGE: Record<string, string> = {
  javascript: "js", typescript: "ts", jsx: "jsx", tsx: "tsx", html: "html",
  css: "css", json: "json", markdown: "md", python: "python", text: "text",
};

/** A comment the language actually supports, or null when it has none. */
function commentFor(language: string, text: string): string | null {
  switch (language) {
    case "html":
    case "markdown":
      return `<!-- ${text.replace(/-->/g, "-- >")} -->`;
    case "css":
    case "javascript":
    case "typescript":
    case "jsx":
    case "tsx":
      return `/* ${text.replace(/\*\//g, "* /")} */`;
    case "python":
    case "text":
      return `# ${text}`;
    default:
      // JSON has no comment syntax; inserting one would corrupt the file.
      return null;
  }
}

/**
 * A deterministic, reviewable file change for Code Studio.
 *
 * It uses only what the request actually carried (the stored open file, or the
 * project's file list) and proposes exactly what it prints — a marker comment at
 * the top of the open file, or a new NOTES.md when nothing is open. The user
 * still has to press Apply, and the diff they review is the diff that is stored.
 */
function demoCodeProposal(meta: Record<string, string | number | boolean | null | undefined>): string | null {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const path = typeof meta.openFilePath === "string" && meta.openFilePath ? meta.openFilePath : null;
  const content = typeof meta.openFileContent === "string" ? meta.openFileContent : null;
  const language = typeof meta.openFileLanguage === "string" && meta.openFileLanguage ? meta.openFileLanguage : "text";
  const fileCount = typeof meta.projectFileCount === "number" ? meta.projectFileCount : 0;

  if (path && content !== null) {
    const marker = commentFor(
      language,
      `Demo edit ${stamp} UTC — written by Delter AI's offline demo provider. No live model is configured, so this is a deterministic change: it adds this comment and alters nothing else.`,
    );

    if (!marker) {
      return [
        "**Why there is no applyable change here**",
        `\`${path}\` is ${language}, which has no comment syntax that can be inserted without corrupting the file (JSON is the usual case). Open a file in another language, or configure a provider key and ask a live model for the edit you want.`,
      ].join("\n\n");
    }

    if (content.includes("Demo edit") && content.trimStart().startsWith(marker.slice(0, 12))) {
      return [
        "**Already marked**",
        `\`${path}\` already starts with a demo marker, so there is nothing to change. Revert or delete that comment line and ask again to see the apply flow a second time.`,
      ].join("\n\n");
    }

    const fence = FENCE_BY_LANGUAGE[language] ?? "text";
    return [
      "**One real change you can apply**",
      `This is not model output — it is a deterministic edit produced offline. It adds a single comment line to the top of \`${path}\` and keeps every other byte exactly as stored (${content.length.toLocaleString("en-US")} characters in, ${content.length + marker.length + 1} out). Review it below; nothing is written to your project until you press Apply.`,
      `\`${path}\``,
      ["```" + fence + " path=" + path, marker, content, "```"].join("\n"),
    ].join("\n\n");
  }

  // Nothing open: propose a file the project can actually use.
  const notes = [
    "# Project notes",
    "",
    `Created by Delter AI's offline demo provider at ${stamp} UTC.`,
    "",
    `- Files in this project when this was written: ${fileCount}`,
    "- No live AI model is configured on this server, so this note is deterministic rather than generated.",
    "",
    "Open a file in the editor and ask the assistant again to see a change proposed against real content.",
    "",
  ].join("\n");

  return [
    "**One real change you can apply**",
    "No file is open in the editor, so there is nothing to edit in place. Instead this proposes a new notes file — deterministic, not model output, and only written if you press Apply.",
    "`NOTES.md`",
    ["```md path=NOTES.md", notes, "```"].join("\n"),
  ].join("\n\n");
}

function compose(request: ProviderRequest): string {
  const lastUser = [...request.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const turns = request.messages.filter((m) => m.role !== "system").length;
  const meta = request.meta ?? {};

  const contextLines: string[] = [];
  if (meta.projectName) contextLines.push(`Project: ${meta.projectName}`);
  if (meta.openFilePath) contextLines.push(`Open file: ${meta.openFilePath} (${meta.openFileLanguage ?? "text"})`);
  if (typeof meta.projectFileCount === "number") contextLines.push(`Files in project: ${meta.projectFileCount}`);
  if (typeof meta.attachedFileCount === "number" && meta.attachedFileCount > 0) {
    contextLines.push(`Attached files: ${meta.attachedFileCount}`);
  }
  if (meta.selection) contextLines.push(`Selected code: ${summarize(String(meta.selection), 160)}`);

  const intent = detectIntent(lastUser);

  const parts: string[] = [];
  parts.push(
    "**Offline demo mode — no AI provider is configured on this server.**\n\n" +
      "This reply was generated locally by Delter AI's demo provider so you can test the product end to end. " +
      "It is not a real language model and cannot write prose, reason about your code, or generate images. " +
      "Add `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` to the server `.env` file and restart to switch to live models.",
  );

  parts.push("**What this request carried**\n\n" + bullet([
    `Detected intent: ${intent}`,
    `Conversation turns sent as context: ${turns}`,
    ...contextLines,
    `System prompt present: ${request.system ? `yes (${request.system.length} chars)` : "no"}`,
    `Model requested: ${request.model}`,
  ]));

  parts.push(`**Your last message**\n\n> ${summarize(lastUser, 400) || "(empty)"}`);

  if (request.system) {
    parts.push(`**System context received (first 240 chars)**\n\n> ${quoteSafe(summarize(request.system, 240))}`);
  }

  // In Code Studio the demo provider still produces a genuine, applyable file
  // change so that the whole review-and-apply flow can be exercised without a
  // provider key. It is deterministic, it says so, and it edits only what it
  // shows — never a file it was not given.
  if (meta.surface === "code") {
    const proposal = demoCodeProposal(meta);
    if (proposal) parts.push(proposal);
  }

  parts.push(demoHelpFor(intent));

  return parts.join("\n\n---\n\n");
}

type Intent = "code" | "website" | "research" | "image" | "explain" | "general";

function detectIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (/(website|landing page|html|hero section|header|css)/.test(t)) return "website";
  if (/(bug|error|fix|refactor|function|class|component|typescript|python|javascript)/.test(t)) return "code";
  if (/(image|picture|logo|illustration|photo)/.test(t)) return "image";
  if (/(research|sources|compare|analyse|analyze|summary of)/.test(t)) return "research";
  if (/(explain|what does|how does|why)/.test(t)) return "explain";
  return "general";
}

function demoHelpFor(intent: Intent): string {
  switch (intent) {
    case "code":
      return "**About code work in demo mode**\n\nThe proposal above is real: apply it and the file is written to your project, the editor reloads it, and the preview re-renders. What demo mode cannot do is think — it will not find bugs, refactor or write new features. Add a provider key to `.env` and the assistant becomes a real model with your project, open file and selection as context.";
    case "website":
      return "**Website Builder** is roadmap step 8 and is not built yet. Code Studio already handles HTML/CSS projects today: create the files, then use the Preview tab to render them in a sandboxed iframe.";
    case "image":
      return "**Image Studio** is roadmap step 7 and is not built yet. It is listed in the sidebar as *not available* rather than as a working tool, so nothing here fakes a generation.";
    case "research":
      return "**Research** is roadmap step 9 and is not built yet. You can still use Chat with attached files as context once a provider key is configured.";
    case "explain":
      return "With a provider key configured, Delter AI answers using your current project, open file and selected code as context.";
    default:
      return "Everything you type here is persisted to the database, streamed token-by-token, and scoped to your account. Test renaming, deleting, attaching files, switching projects and retrying a failed message — those flows are all real.";
  }
}

export const demoProvider: AiProvider = {
  id: "delter-demo",
  label: "Delter Demo (offline)",

  isConfigured() {
    // Always available: it has no external dependency.
    return true;
  },

  status() {
    return {
      id: "delter-demo",
      label: "Delter Demo (offline)",
      configured: true,
      reason: "Local offline responder. Not a language model — used when no provider key is configured.",
    };
  },

  models() {
    return [
      {
        id: MODEL_ID,
        provider: "delter-demo",
        label: "Delter Demo (offline — not a real model)",
        description:
          "Local responder for testing the product without an API key. States plainly that it is offline and never imitates a real model.",
        capabilities: { chat: true, streaming: true, images: false, imageInput: false },
        requiresKey: false,
      },
    ];
  },

  async *stream(request: ProviderRequest): AsyncGenerator<StreamChunk> {
    const full = compose(request);

    // Stream in small slices with realistic pacing so the UI's streaming path,
    // stop button and auto-scroll are all genuinely exercised.
    const words = full.split(/(\s+)/);
    let chunk = "";
    let emitted = 0;
    for (const word of words) {
      if (request.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      chunk += word;
      if (chunk.length >= 24) {
        yield { type: "delta", text: chunk };
        emitted += chunk.trim().split(/\s+/).filter(Boolean).length;
        chunk = "";
        await new Promise((resolve) => setTimeout(resolve, 8));
      }
    }
    if (chunk) yield { type: "delta", text: chunk };

    const approxTokens = Math.max(1, Math.round(full.length / 4));
    yield { type: "usage", usage: { inputTokens: Math.max(1, emitted), outputTokens: approxTokens, totalTokens: approxTokens + Math.max(1, emitted) } };
    yield { type: "done", finishReason: "stop" };
  },
};
