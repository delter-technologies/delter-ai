/**
 * Turning an assistant reply into real file changes.
 *
 * The model does not have write access to a project. It writes Markdown; this
 * module reads that Markdown and extracts the file operations it proposes, and
 * the assistant panel shows them to the user before anything is saved.
 *
 * Deliberately conservative: a code block is only treated as a file operation
 * when a project-relative path can be found for it. Anything ambiguous becomes
 * a *note* explaining why it was not applied, rather than a guess that could
 * overwrite the wrong file.
 */

export type ProposedOp = {
  id: string;
  action: "create" | "update" | "delete";
  path: string;
  content: string;
  language: string;
  /** How many characters the file would have after applying. */
  chars: number;
  /** Where the path came from, shown in the review list so it can be checked. */
  pathSource: "code block attribute" | "heading or prose before the block";
};

export type ParseNote = {
  id: string;
  message: string;
};

export type ParsedReply = {
  ops: ProposedOp[];
  notes: ParseNote[];
};

/** Extensions Code Studio knows, used to sanity-check a bare path mention. */
const KNOWN_EXT = new Set([
  "html", "htm", "css", "scss", "js", "mjs", "cjs", "jsx", "ts", "tsx", "json", "md", "markdown",
  "svg", "txt", "py", "yml", "yaml", "toml", "xml", "csv", "sh",
]);

/** Something like `example.com`, `npm install`, `https://…` — not a file path. */
const NOT_A_PATH = /^(https?:|\/\/|www\.|npm |npx |node |git |pnpm |yarn |bun |pip |python |curl |cd |mkdir )/i;

type Block = {
  info: string;
  content: string;
  startLine: number;
  endLine: number;
};

type OpenFence = { info: string; start: number; body: string[]; marker: string };

function findBlocks(text: string): { blocks: Block[]; proseLines: string[] } {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  const proseLines: string[] = [];
  let open: OpenFence | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (open) {
      const closing = new RegExp(`^\\s{0,3}${open.marker === "`" ? "`" : "~"}{3,}\\s*$`).test(line);
      if (closing) {
        blocks.push({ info: open.info, content: open.body.join("\n"), startLine: open.start, endLine: index });
        open = null;
      } else {
        open.body.push(line);
      }
      proseLines.push("");
      continue;
    }

    // A fence inside a blockquote is quoted material (an example, or an earlier
    // reply being repeated back), never a proposal to write a file.
    if (/^\s{0,3}>/.test(line)) {
      proseLines.push(line);
      continue;
    }

    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})\s*(.*)$/);
    if (fenceMatch) {
      open = { info: (fenceMatch[2] ?? "").trim(), start: index, body: [], marker: fenceMatch[1][0] };
      proseLines.push("");
      continue;
    }

    proseLines.push(line);
  }

  // An unterminated fence at the end of a reply: still report what arrived.
  if (open) {
    const unterminated = open;
    blocks.push({
      info: unterminated.info,
      content: unterminated.body.join("\n"),
      startLine: unterminated.start,
      endLine: lines.length,
    });
  }

  return { blocks, proseLines };
}

/** Pull `path=src/a.ts`, `file="src/a.ts"`, `filename: src/a.ts` from a fence info string. */
function pathFromInfo(info: string): { path: string | null; language: string } {
  const match = info.match(/\b(?:path|file|filename|title)\s*[:=]\s*["'`]?([^"'`\s]+)["'`]?/i);
  const firstToken = info.split(/\s+/)[0] ?? "";
  return { path: match ? match[1] : null, language: firstToken.toLowerCase() };
}

function looksLikePath(candidate: string): boolean {
  const value = candidate.replace(/^["'`]+|["'`:]+$/g, "").trim();
  if (!value || value.length > 240) return false;
  if (NOT_A_PATH.test(value)) return false;
  if (/\s/.test(value)) return false;
  if (value.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(value)) return false;
  if (value.includes("..")) return false;
  const dot = value.lastIndexOf(".");
  if (dot < 1 || dot === value.length - 1) return false;
  const ext = value.slice(dot + 1).toLowerCase();
  return KNOWN_EXT.has(ext);
}

/**
 * Search the prose immediately above a code block for a path mention. The
 * convention every coding model follows is one of:
 *   `src/App.tsx`            **src/App.tsx**         ### src/App.tsx
 *   Create `src/App.tsx`:    Replace src/styles.css with:
 */
function pathFromProse(proseLines: string[], blockStart: number): string | null {
  let seen = 0;
  for (let i = blockStart - 1; i >= 0 && seen < 6; i--) {
    const line = proseLines[i];
    if (!line || !line.trim()) continue;
    seen++;

    // Prefer explicitly marked-up mentions, then bare tokens.
    const marked = [...line.matchAll(/(?:`([^`]+)`|\*\*([^*]+)\*\*)/g)].map((m) => m[1] ?? m[2] ?? "");
    for (const candidate of marked) {
      if (looksLikePath(candidate)) return cleanPath(candidate);
    }

    const bare = line.split(/[\s,;:()]+/).filter(Boolean);
    for (const candidate of bare) {
      if (looksLikePath(candidate)) return cleanPath(candidate);
    }
  }
  return null;
}

function cleanPath(raw: string): string {
  return raw
    .replace(/^["'`]+|["'`.:,]+$/g, "")
    .replace(/^\.\//, "")
    .trim();
}

/** A unified diff cannot be applied by a full-content store, so say so. */
function looksLikeDiff(content: string): boolean {
  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return false;
  if (lines.some((l) => /^@@\s.*@@/.test(l))) return true;
  const changed = lines.filter((l) => /^[+-]/.test(l) && !/^[+-]{3}/.test(l)).length;
  return changed / lines.length > 0.5;
}

export function parseProposedFileOps(
  text: string,
  options: { existingPaths: Set<string> } = { existingPaths: new Set() },
): ParsedReply {
  const { blocks, proseLines } = findBlocks(text);
  const ops: ProposedOp[] = [];
  const notes: ParseNote[] = [];
  const claimed = new Set<string>();
  let counter = 0;
  const nextId = () => `op_${(counter += 1)}`;

  const lowerText = text.toLowerCase();

  for (const block of blocks) {
    const { path: attrPath, language } = pathFromInfo(block.info);
    let path = attrPath && looksLikePath(attrPath) ? cleanPath(attrPath) : null;
    let pathSource: ProposedOp["pathSource"] = "code block attribute";

    if (!path) {
      const prosePath = pathFromProse(proseLines, block.startLine);
      if (prosePath) {
        path = prosePath;
        pathSource = "heading or prose before the block";
      }
    }

    if (!path) {
      const languageLabel = block.info.split(/\s+/)[0] || "code";
      notes.push({
        id: nextId(),
        message: `A ${languageLabel} block was not applied because no file path was given for it. Ask the assistant to say which file the code belongs to, for example “create \`src/App.tsx\`”.`,
      });
      continue;
    }

    if (looksLikeDiff(block.content)) {
      notes.push({
        id: nextId(),
        message: `The block for \`${path}\` looks like a diff rather than a complete file, and Code Studio stores whole files. Ask the assistant for the full updated contents of \`${path}\`.`,
      });
      continue;
    }

    if (claimed.has(path)) {
      // Later block wins — models often show a draft then the final version.
      const previous = ops.findIndex((op) => op.path === path);
      if (previous >= 0) ops.splice(previous, 1);
      notes.push({
        id: nextId(),
        message: `\`${path}\` appeared in more than one code block; the last one is used.`,
      });
    }
    claimed.add(path);

    const exists = options.existingPaths.has(path);
    const isDelete = lowerText.includes(`delete \`${path.toLowerCase()}\``);

    ops.push({
      id: nextId(),
      action: isDelete ? "delete" : exists ? "update" : "create",
      path,
      content: block.content,
      language: language || languageFromPath(path),
      chars: block.content.length,
      pathSource,
    });
  }

  // Explicit delete requests with no code block: “Delete `src/old.ts`”.
  for (const match of text.matchAll(/\b(?:delete|remove)\s+`([^`]+)`/gi)) {
    const candidate = match[1];
    if (!looksLikePath(candidate)) continue;
    const path = cleanPath(candidate);
    if (claimed.has(path) || !options.existingPaths.has(path)) continue;
    claimed.add(path);
    ops.push({
      id: nextId(),
      action: "delete",
      path,
      content: "",
      language: languageFromPath(path),
      chars: 0,
      pathSource: "heading or prose before the block",
    });
  }

  return { ops, notes };
}

function languageFromPath(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  const map: Record<string, string> = {
    html: "html", htm: "html", css: "css", scss: "css", js: "javascript", mjs: "javascript",
    cjs: "javascript", jsx: "jsx", ts: "typescript", tsx: "tsx", json: "json", md: "markdown",
    markdown: "markdown", py: "python", txt: "text",
  };
  return map[ext] ?? "text";
}

/** A tiny line-level diff used only to describe the change in the review list. */
export function summariseChange(previous: string, next: string): { added: number; removed: number } {
  const before = previous.split("\n");
  const after = next.split("\n");
  const beforeCounts = new Map<string, number>();
  for (const line of before) beforeCounts.set(line, (beforeCounts.get(line) ?? 0) + 1);

  let added = 0;
  let removed = 0;
  const remaining = new Map(beforeCounts);
  for (const line of after) {
    const count = remaining.get(line) ?? 0;
    if (count > 0) remaining.set(line, count - 1);
    else added++;
  }
  for (const count of remaining.values()) removed += count;

  return { added, removed };
}
