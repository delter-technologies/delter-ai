import "server-only";
import type { ChatMessage } from "./types";

/**
 * Context assembly.
 *
 * The brief's rule: "maintain relevant conversation context without sending
 * unnecessary data." So context here is layered and budgeted —
 * identity → user → project → files → open code → recent turns —
 * and each layer is truncated against a character budget before it reaches a
 * provider. Nothing is dumped wholesale.
 */

/** Rough chars-per-token for budgeting. Deliberately conservative. */
const CHARS_PER_TOKEN = 4;

export type ContextBudget = {
  /** Total characters allowed for system + history. */
  total: number;
  /** Ceiling for any single file included as context. */
  perFile: number;
  /** How many recent turns to keep verbatim. */
  recentMessages: number;
};

export const DEFAULT_BUDGET: ContextBudget = {
  total: 96_000,
  perFile: 12_000,
  recentMessages: 24,
};

/** Small budget for quick helper calls (title generation, summaries). */
export const LIGHT_BUDGET: ContextBudget = {
  total: 8_000,
  perFile: 1_500,
  recentMessages: 4,
};

export function truncate(text: string, maxChars: number, label?: string): string {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  const head = text.slice(0, maxChars);
  const omitted = text.length - head.length;
  const suffix = `\n… [truncated ${omitted.toLocaleString()} characters${label ? ` of ${label}` : ""}]`;
  return head + suffix;
}

export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / CHARS_PER_TOKEN);
}

export type ProjectContext = {
  name: string;
  description?: string | null;
  instructions?: string | null;
  kind?: string | null;
  /** Project-relative paths, for orienting the model without sending contents. */
  filePaths?: string[];
  /** Files whose contents are included, already trimmed. */
  files?: { path: string; language?: string | null; content: string }[];
};

export type AttachedFileContext = {
  name: string;
  mimeType?: string | null;
  content?: string | null;
};

export type CodeStudioContext = {
  openFilePath?: string | null;
  openFileContent?: string | null;
  openFileLanguage?: string | null;
  selectedCode?: string | null;
};

export type UserContext = {
  displayName?: string | null;
  name?: string | null;
  mainPurpose?: string | null;
  interests?: string | null;
};

export type SystemPromptInput = {
  surface: "chat" | "code" | "title";
  user?: UserContext;
  project?: ProjectContext | null;
  attachedFiles?: AttachedFileContext[];
  code?: CodeStudioContext | null;
  budget?: ContextBudget;
};

const IDENTITY = [
  "You are Delter AI, the assistant inside the Delter AI workspace, a product of Delter Technologies.",
  "You work alongside the user across chat, projects, files, Code Studio and the other Delter AI tools.",
  "",
  "How you work:",
  "- Answer the question actually asked. Do not pad responses with preamble or restatements.",
  "- Use Markdown: short paragraphs, lists, tables where they help, fenced code blocks with a language tag.",
  "- Keep conversational context. When the user says \"the header\", \"that file\" or \"make it darker\", resolve it against the project, files and earlier turns supplied below instead of asking them to repeat themselves.",
  "- Never invent facts, sources, file contents, statistics, awards, funding, customers or user counts. If you do not know, say so.",
  "- If a request needs something you were not given (a missing file, an unclear target), say precisely what you need.",
  "- Be direct about limitations rather than agreeing to something you cannot do.",
].join("\n");

const SURFACE_INSTRUCTIONS: Record<SystemPromptInput["surface"], string> = {
  chat: [
    "You are in the Chat surface. Help with writing, analysis, planning, code questions and research discussion.",
    "When the user asks for code, give complete, runnable snippets rather than fragments with gaps.",
  ].join("\n"),
  code: [
    "You are the Code Studio assistant. The user is editing real project files that are persisted in a database.",
    "",
    "Rules for code work:",
    "- Refer to files by their exact project-relative path.",
    "- When you output code the user should save, put it in ONE fenced block and state the exact file path on the line above it.",
    "- Code Studio can apply your changes to the project. To make a block applyable, also tag the fence with the path attribute, for example: \\`\\`\\`tsx path=src/App.tsx. One block per file, never split a file across blocks.",
    "- Inside an applyable block put the COMPLETE file content, not an excerpt and not a diff — the store writes whole files. If the user asked for a diff, explain that it cannot be applied automatically.",
    "- When you change existing code, show the full updated file rather than a diff, unless the user asked for a diff.",
    "- Preserve the project's existing style, naming and dependencies. Do not introduce new libraries without saying why.",
    "- Do not fabricate file contents you were not given. If you need to see a file, ask for it.",
    "- Point out real bugs and risks you notice, briefly, without lecturing.",
  ].join("\n"),
  title: [
    "You name conversations. Reply with a title only: 2 to 5 words, no quotation marks, no trailing punctuation, no explanation.",
    "Base it on what the user actually asked. Match the language of the user's message.",
  ].join("\n"),
};

export function buildSystemPrompt(input: SystemPromptInput): string {
  const budget = input.budget ?? DEFAULT_BUDGET;
  const sections: string[] = [IDENTITY, "", SURFACE_INSTRUCTIONS[input.surface]];

  // --- User ------------------------------------------------------------
  const userBits: string[] = [];
  const address = input.user?.displayName || input.user?.name;
  if (address) userBits.push(`Display name: ${address}`);
  if (input.user?.mainPurpose) userBits.push(`Main purpose for using Delter AI: ${input.user.mainPurpose}`);
  if (input.user?.interests) userBits.push(`Interests: ${input.user.interests}`);
  if (userBits.length) {
    sections.push("", "## The user", userBits.map((b) => `- ${b}`).join("\n"));
  }

  // --- Project ---------------------------------------------------------
  if (input.project) {
    const p = input.project;
    const lines: string[] = ["", "## Current project", `- Name: ${p.name}`];
    if (p.kind && p.kind !== "general") lines.push(`- Type: ${p.kind}`);
    if (p.description) lines.push(`- Description: ${truncate(p.description, 800)}`);
    if (p.instructions) lines.push(`- Project instructions from the user:\n${truncate(p.instructions, 2_000)}`);
    if (p.filePaths?.length) {
      lines.push(`- Source files in this project (${p.filePaths.length}):`, p.filePaths.slice(0, 200).map((f) => `    - ${f}`).join("\n"));
    }
    sections.push(...lines);

    if (p.files?.length) {
      sections.push("", "## Project file contents");
      let remaining = Math.floor(budget.total * 0.4);
      for (const file of p.files) {
        if (remaining <= 400) {
          sections.push(`(remaining files omitted to stay within the context budget)`);
          break;
        }
        const cap = Math.min(budget.perFile, remaining);
        const body = truncate(file.content ?? "", cap, file.path);
        remaining -= body.length + file.path.length + 12;
        sections.push(`### ${file.path}${file.language ? ` (${file.language})` : ""}\n\`\`\`${file.language ?? ""}\n${body}\n\`\`\``);
      }
    }
  }

  // --- Attached files --------------------------------------------------
  if (input.attachedFiles?.length) {
    sections.push("", "## Files the user attached to this conversation");
    let remaining = Math.floor(budget.total * 0.25);
    for (const file of input.attachedFiles) {
      if (file.content) {
        const cap = Math.min(budget.perFile, Math.max(400, remaining));
        const body = truncate(file.content, cap, file.name);
        remaining -= body.length;
        sections.push(`### ${file.name}${file.mimeType ? ` (${file.mimeType})` : ""}\n\`\`\`\n${body}\n\`\`\``);
      } else {
        sections.push(`- ${file.name}${file.mimeType ? ` (${file.mimeType})` : ""} — binary file, contents not readable as text.`);
      }
    }
  }

  // --- Open file in the editor ----------------------------------------
  if (input.code?.openFilePath) {
    sections.push(
      "",
      "## Currently open in the editor",
      `- Path: ${input.code.openFilePath}${input.code.openFileLanguage ? ` (${input.code.openFileLanguage})` : ""}`,
    );
    if (input.code.openFileContent != null) {
      const cap = Math.min(budget.perFile * 2, Math.floor(budget.total * 0.3));
      sections.push(`\`\`\`${input.code.openFileLanguage ?? ""}\n${truncate(input.code.openFileContent, cap, input.code.openFilePath)}\n\`\`\``);
    } else {
      sections.push("(the file is empty)");
    }
    if (input.code.selectedCode) {
      sections.push(
        "### The user's current selection — this is what \"this code\" refers to",
        `\`\`\`${input.code.openFileLanguage ?? ""}\n${truncate(input.code.selectedCode, 6_000, "selection")}\n\`\`\``,
      );
    }
  }

  return sections.join("\n");
}

/**
 * Trim history to the budget, newest-first, then restore chronological order.
 * The most recent turns stay verbatim; if even they do not fit, the oldest of
 * them is truncated rather than dropped, so the model still sees the request.
 */
export function trimHistory(messages: ChatMessage[], budget: ContextBudget = DEFAULT_BUDGET): ChatMessage[] {
  if (!messages.length) return [];
  const recent = messages.slice(-budget.recentMessages);
  const out: ChatMessage[] = [];
  let used = 0;

  for (let i = recent.length - 1; i >= 0; i--) {
    const message = recent[i];
    if (used + message.content.length > budget.total && out.length > 0) break;
    out.unshift(message);
    used += message.content.length;
  }

  if (!out.length && recent.length) {
    const last = recent[recent.length - 1];
    out.push({ role: last.role, content: truncate(last.content, budget.total) });
  }

  return out;
}
