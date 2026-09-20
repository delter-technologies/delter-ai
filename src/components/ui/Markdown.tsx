"use client";

import { memo, useState, type ReactNode } from "react";

/**
 * Markdown renderer for assistant output.
 *
 * Written in-house rather than pulling a markdown library plus a highlighter
 * (roughly 150 KB of client JS) because Delter AI has to stay light and because
 * the security requirement is absolute: assistant text is untrusted, so the
 * renderer builds React elements from parsed tokens and never touches
 * `dangerouslySetInnerHTML`. Raw HTML in a model's reply is shown as text, not
 * rendered.
 *
 * Supported: headings, paragraphs, hard breaks, bold/italic/inline code, links,
 * fenced code blocks with a language label and copy button, unordered and
 * ordered lists (nested), blockquotes, horizontal rules, tables, images by
 * https URL only.
 */

type Token =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "code"; language: string; code: string }
  | { kind: "list"; ordered: boolean; items: { indent: number; text: string }[] }
  | { kind: "quote"; text: string }
  | { kind: "rule" }
  | { kind: "table"; head: string[]; rows: string[][]; align: ("left" | "right" | "center")[] };

export function parseMarkdown(source: string): Token[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const tokens: Token[] = [];

  let index = 0;
  let paragraph: string[] = [];
  let list: { indent: number; text: string }[] | null = null;
  let listOrdered = false;

  const flushParagraph = () => {
    if (paragraph.length) {
      tokens.push({ kind: "paragraph", text: paragraph.join("\n") });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list?.length) tokens.push({ kind: "list", ordered: listOrdered, items: list });
    list = null;
  };

  while (index < lines.length) {
    const line = lines[index];

    // Fenced code block — the most important case for a coding assistant.
    const fence = line.match(/^ {0,3}(```|~~~)\s*([\w+#.-]*)\s*$/);
    if (fence) {
      flushParagraph();
      flushList();
      const closer = fence[1];
      const language = (fence[2] || "").toLowerCase();
      const body: string[] = [];
      index++;
      while (index < lines.length && !new RegExp(`^ {0,3}${closer}\\s*$`).test(lines[index])) {
        body.push(lines[index]);
        index++;
      }
      index++; // consume the closing fence
      tokens.push({ kind: "code", language: normaliseLanguage(language), code: body.join("\n") });
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      index++;
      continue;
    }

    const heading = line.match(/^ {0,3}(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      tokens.push({ kind: "heading", level: heading[1].length, text: heading[2].replace(/\s+#+\s*$/, "") });
      index++;
      continue;
    }

    if (/^ {0,3}([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      flushParagraph();
      flushList();
      tokens.push({ kind: "rule" });
      index++;
      continue;
    }

    const quote = line.match(/^ {0,3}>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();
      tokens.push({ kind: "quote", text: quote[1] });
      index++;
      continue;
    }

    // Table: a header row followed by a delimiter row.
    if (line.includes("|") && index + 1 < lines.length && /^ {0,3}\|?[\s:|-]+\|[\s:|-]*$/.test(lines[index + 1])) {
      const parsedTable = tryParseTable(lines, index);
      if (parsedTable) {
        flushParagraph();
        flushList();
        tokens.push(parsedTable.token);
        index = parsedTable.nextIndex;
        continue;
      }
    }

    const ordered = line.match(/^(\s*)(\d{1,9})[.)]\s+(.*)$/);
    const unordered = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (ordered || unordered) {
      flushParagraph();
      const indent = Math.floor((((ordered ?? unordered)![1] as string).length) / 2);
      const text = ordered ? ordered[3] : unordered![2];
      const isOrdered = Boolean(ordered);
      if (!list) {
        list = [];
        listOrdered = isOrdered;
      } else if (isOrdered !== listOrdered) {
        flushList();
        list = [];
        listOrdered = isOrdered;
      }
      list.push({ indent, text });
      index++;
      continue;
    }

    flushList();
    paragraph.push(line);
    index++;
  }

  flushParagraph();
  flushList();
  return tokens;
}

function tryParseTable(lines: string[], start: number): { token: Token; nextIndex: number } | null {
  const splitRow = (row: string) =>
    row
      .replace(/^\s*\|/, "")
      .replace(/\|\s*$/, "")
      .split("|")
      .map((cell) => cell.trim());

  const head = splitRow(lines[start]);
  const delimiter = splitRow(lines[start + 1]);
  if (head.length < 1 || delimiter.length !== head.length) return null;
  if (!delimiter.every((cell) => /^:?-{1,}:?$/.test(cell))) return null;

  const align = delimiter.map((cell) =>
    cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : "left",
  ) as ("left" | "right" | "center")[];

  const rows: string[][] = [];
  let nextIndex = start + 2;
  while (nextIndex < lines.length && lines[nextIndex].includes("|") && lines[nextIndex].trim()) {
    rows.push(splitRow(lines[nextIndex]));
    nextIndex++;
  }

  return { token: { kind: "table", head, rows, align }, nextIndex };
}

const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  node: "javascript",
  ts: "typescript",
  tsx: "tsx",
  jsx: "jsx",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  md: "markdown",
  "c++": "cpp",
  "c#": "csharp",
  cs: "csharp",
  vue: "html",
  svelte: "html",
  astro: "html",
  golang: "go",
  rs: "rust",
  rb: "ruby",
  plain: "text",
  plaintext: "text",
  "": "text",
};

function normaliseLanguage(language: string): string {
  return LANGUAGE_ALIASES[language] ?? language;
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

export const Markdown = memo(function Markdown({
  source,
  className = "",
  /** While streaming we skip the table pass; it re-parses on every delta. */
  streaming = false,
}: {
  source: string;
  className?: string;
  streaming?: boolean;
}) {
  const tokens = parseMarkdown(source);

  return (
    <div className={`prose-delter ${className}`}>
      {tokens.map((token, tokenIndex) => {
        switch (token.kind) {
          case "heading": {
            const Tag = (`h${Math.min(6, Math.max(1, token.level))}` as unknown) as "h1";
            return <Tag key={tokenIndex}>{renderInline(token.text)}</Tag>;
          }
          case "paragraph":
            return <p key={tokenIndex}>{renderInline(token.text)}</p>;
          case "quote":
            return <blockquote key={tokenIndex}>{renderInline(token.text)}</blockquote>;
          case "rule":
            return <hr key={tokenIndex} />;
          case "code":
            return <CodeBlock key={tokenIndex} language={token.language} code={token.code} streaming={streaming} />;
          case "list":
            return <ListView key={tokenIndex} token={token} />;
          case "table":
            return (
              <table key={tokenIndex}>
                <thead>
                  <tr>
                    {token.head.map((cell, cellIndex) => (
                      <th key={cellIndex} style={{ textAlign: token.align[cellIndex] ?? "left" }}>
                        {renderInline(cell)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {token.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {token.head.map((_, cellIndex) => (
                        <td key={cellIndex} style={{ textAlign: token.align[cellIndex] ?? "left" }}>
                          {renderInline(row[cellIndex] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          default:
            return null;
        }
      })}
    </div>
  );
});

/** Renders nested lists from the flat indent list produced by the parser. */
function ListView({ token }: { token: Extract<Token, { kind: "list" }> }) {
  type Node = { text: string; children: Node[] };
  const roots: Node[] = [];
  const stack: { indent: number; node: Node }[] = [];

  for (const item of token.items) {
    const node: Node = { text: item.text, children: [] };
    while (stack.length && stack[stack.length - 1].indent >= item.indent) stack.pop();
    if (stack.length) stack[stack.length - 1].node.children.push(node);
    else roots.push(node);
    stack.push({ indent: item.indent, node });
  }

  const Tag = token.ordered ? "ol" : "ul";

  const renderNodes = (nodes: Node[]): ReactNode =>
    nodes.map((node, index) => (
      <li key={index}>
        {renderInline(node.text)}
        {node.children.length ? <Tag>{renderNodes(node.children)}</Tag> : null}
      </li>
    ));

  return <Tag>{renderNodes(roots)}</Tag>;
}

/* -------------------------------------------------------------------------- */
/* Inline parsing — produces React nodes, never HTML strings                   */
/* -------------------------------------------------------------------------- */

const INLINE_PATTERN =
  /(`+)([\s\S]*?)\1|(\*\*\*|___)([\s\S]+?)\3|(\*\*|__)([\s\S]+?)\5|(\*|_)([^\s*_][\s\S]*?)\7|(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)|<(https?:\/\/[^\s>]+)>/g;

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const match of text.matchAll(INLINE_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(<HardBreaks key={key++} text={text.slice(cursor, start)} />);

    const [, codeFence, codeBody, boldItalicFence, boldItalicBody, boldFence, boldBody, italicFence, italicBody, bang, linkText, linkHref, linkTitle, autolink] = match;

    if (codeFence) {
      nodes.push(<code key={key++}>{codeBody}</code>);
    } else if (boldItalicFence) {
      nodes.push(
        <strong key={key++}>
          <em>{renderInline(boldItalicBody)}</em>
        </strong>,
      );
    } else if (boldFence) {
      nodes.push(<strong key={key++}>{renderInline(boldBody)}</strong>);
    } else if (italicFence) {
      nodes.push(<em key={key++}>{renderInline(italicBody)}</em>);
    } else if (autolink) {
      nodes.push(
        <SafeLink key={key++} href={autolink}>
          {autolink}
        </SafeLink>,
      );
    } else if (linkHref !== undefined) {
      if (bang) {
        // Only remote https images are rendered; anything else is shown as text
        // so a data: URI or javascript: URL cannot be injected.
        nodes.push(
          /^https:\/\/\S+$/i.test(linkHref) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={key++} src={linkHref} alt={linkText} loading="lazy" />
          ) : (
            <code key={key++}>{`![${linkText}](${linkHref})`}</code>
          ),
        );
      } else {
        nodes.push(
          <SafeLink key={key++} href={linkHref} title={linkTitle}>
            {renderInline(linkText)}
          </SafeLink>,
        );
      }
    }

    cursor = start + match[0].length;
  }

  if (cursor < text.length) nodes.push(<HardBreaks key={key++} text={text.slice(cursor)} />);
  return nodes;
}

/** Two trailing spaces (or a bare newline) mean a hard line break. */
function HardBreaks({ text }: { text: string }) {
  const parts = text.split(/ {2,}\n|\n/);
  return (
    <>
      {parts.map((part, index) => (
        <span key={index}>
          {index > 0 ? <br /> : null}
          {part}
        </span>
      ))}
    </>
  );
}

const SAFE_PROTOCOL = /^(https?:|mailto:|tel:|#|\/)/i;

function SafeLink({ href, title, children }: { href: string; title?: string; children: ReactNode }) {
  // A link a model produced is untrusted input. Anything that is not http(s),
  // mailto, tel, an anchor or a relative path is rendered as inert text.
  if (!SAFE_PROTOCOL.test(href)) {
    return <code title="Link removed: unsupported protocol">{children}</code>;
  }
  const external = /^https?:/i.test(href);
  return (
    <a
      href={href}
      title={title}
      {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
    >
      {children}
    </a>
  );
}

/* -------------------------------------------------------------------------- */
/* Code blocks                                                                 */
/* -------------------------------------------------------------------------- */

function CodeBlock({ language, code, streaming }: { language: string; code: string; streaming: boolean }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is unavailable (permissions, insecure context). Tell the user
      // rather than showing a "Copied" state that never happened.
      setCopied(false);
      window.prompt("Copy the code with ⌘/Ctrl+C:", code);
    }
  };

  return (
    <div className="not-prose my-3 overflow-hidden rounded-md border" style={{ borderColor: "var(--border)" }}>
      <div
        className="flex items-center justify-between gap-3 border-b px-3 py-1.5"
        style={{ borderColor: "var(--border)", background: "var(--bg-muted)" }}
      >
        <span className="font-mono text-[11px] font-medium uppercase tracking-wide text-fg-muted">
          {language || "code"}
        </span>
        <div className="flex items-center gap-2">
          {streaming ? <span className="text-[11px] text-fg-faint">generating…</span> : null}
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] font-medium text-fg-secondary transition-colors hover:bg-bg-subtle hover:text-fg"
            aria-label={copied ? "Copied to clipboard" : "Copy code to clipboard"}
          >
            {copied ? (
              <>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M13 4.75 6.25 11.5 3 8.25" />
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="5.5" y="5.5" width="8" height="8" rx="1.4" />
                  <path d="M10.5 5.5v-2A1.5 1.5 0 0 0 9 2H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 10h1.5" />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>
      </div>
      <pre className="!my-0 !rounded-none !border-0">
        <HighlightedCode code={code} language={language} />
      </pre>
    </div>
  );
}

/**
 * Token-level highlighting for the languages Delter AI's assistant actually
 * writes. Cheap and synchronous; falls back to plain text for anything unknown.
 */
function HighlightedCode({ code, language }: { code: string; language: string }) {
  const grammar = GRAMMARS[language];
  if (!grammar) return <code>{code}</code>;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  const pattern = new RegExp(grammar.rules.map((rule) => `(${rule.pattern.source})`).join("|"), "g");

  for (const match of code.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(<span key={key++}>{code.slice(cursor, start)}</span>);

    // Whichever alternative matched determines the token type.
    let offset = 1;
    let type = "plain";
    for (const rule of grammar.rules) {
      if (match[offset] !== undefined) {
        type = rule.type;
        break;
      }
      offset += rule.pattern.source.includes("(") ? countGroups(rule.pattern.source) + 1 : 1;
    }

    nodes.push(
      <span key={key++} style={{ color: TOKEN_COLORS[type] ?? "inherit" }}>
        {match[0]}
      </span>,
    );
    cursor = start + match[0].length;
  }

  if (cursor < code.length) nodes.push(<span key={key++}>{code.slice(cursor)}</span>);
  return <code>{nodes}</code>;
}

function countGroups(source: string): number {
  // Count capturing groups that are not non-capturing / lookaround.
  let count = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\\") {
      i++;
      continue;
    }
    if (source[i] === "[" ) {
      while (i < source.length && source[i] !== "]") {
        if (source[i] === "\\") i++;
        i++;
      }
      continue;
    }
    if (source[i] === "(" && source[i + 1] !== "?") count++;
  }
  return count;
}

const TOKEN_COLORS: Record<string, string> = {
  comment: "var(--text-faint)",
  string: "#8fbf6a",
  keyword: "#c792ea",
  number: "#e0a458",
  builtin: "#6cb6ff",
  punctuation: "var(--text-muted)",
  tag: "#f0736a",
  attribute: "#e0a458",
  property: "#9dc0ff",
};

type Rule = { type: string; pattern: RegExp };
type Grammar = { rules: Rule[] };

const JS_KEYWORDS =
  "const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|super|this|typeof|instanceof|in|of|import|from|export|default|async|await|try|catch|finally|throw|delete|void|yield|static|get|set|interface|type|enum|implements|public|private|protected|readonly|as|is|keyof|declare|namespace|module|satisfies";
const JS_LITERALS = "true|false|null|undefined|NaN|Infinity";

const GRAMMARS: Record<string, Grammar> = {
  javascript: jsGrammar(),
  typescript: jsGrammar(),
  jsx: jsGrammar(),
  tsx: jsGrammar(),
  python: {
    rules: [
      { type: "comment", pattern: /#[^\n]*/y },
      { type: "string", pattern: /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')/y },
      { type: "keyword", pattern: /\b(?:def|class|return|if|elif|else|for|while|in|not|and|or|is|None|True|False|import|from|as|with|try|except|finally|raise|lambda|yield|global|nonlocal|pass|break|continue|assert|del|async|await|self)\b/y },
      { type: "number", pattern: /\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/iy },
      { type: "builtin", pattern: /\b(?:print|len|range|str|int|float|list|dict|set|tuple|bool|open|enumerate|zip|map|filter|sorted|sum|min|max|abs|any|all|isinstance|type|super)\b/y },
      { type: "property", pattern: /@\w+/y },
    ],
  },
  html: {
    rules: [
      { type: "comment", pattern: /<!--[\s\S]*?-->/y },
      { type: "string", pattern: /"[^"]*"|'[^']*'/y },
      { type: "tag", pattern: /<\/?[a-zA-Z][\w:-]*/y },
      { type: "attribute", pattern: /\b[a-zA-Z-]+(?==)/y },
      { type: "keyword", pattern: /<!doctype[^>]*>/iy },
    ],
  },
  css: {
    rules: [
      { type: "comment", pattern: /\/\*[\s\S]*?\*\//y },
      { type: "string", pattern: /"[^"]*"|'[^']*'/y },
      { type: "property", pattern: /[a-zA-Z-]+(?=\s*:)/y },
      { type: "keyword", pattern: /@[\w-]+/y },
      { type: "builtin", pattern: /::?[a-zA-Z-]+|\.[\w-]+|#[\w-]+/y },
      { type: "number", pattern: /-?\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms|deg|fr)?\b|#[0-9a-fA-F]{3,8}\b/y },
    ],
  },
  json: {
    rules: [
      { type: "property", pattern: /"(?:\\.|[^"\\])*"(?=\s*:)/y },
      { type: "string", pattern: /"(?:\\.|[^"\\])*"/y },
      { type: "keyword", pattern: /\b(?:true|false|null)\b/y },
      { type: "number", pattern: /-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/iy },
    ],
  },
  bash: {
    rules: [
      { type: "comment", pattern: /#[^\n]*/y },
      { type: "string", pattern: /"(?:\\.|[^"\\])*"|'[^']*'/y },
      { type: "keyword", pattern: /\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|function|return|in|export|local|readonly|source|echo|cd|npm|npx|node|python3?|git|curl|mkdir|rm|cp|mv|ls|cat|sudo|apt|brew|pip3?)\b/y },
      { type: "builtin", pattern: /\$\{?\w+\}?/y },
      { type: "attribute", pattern: /(^|\s)-{1,2}[\w-]+/y },
    ],
  },
  markdown: {
    rules: [
      { type: "keyword", pattern: /^ {0,3}#{1,6}[^\n]*/my },
      { type: "string", pattern: /`[^`]+`/y },
      { type: "builtin", pattern: /\*\*[^*]+\*\*/y },
      { type: "comment", pattern: /^\s*>[^\n]*/my },
    ],
  },
  sql: {
    rules: [
      { type: "comment", pattern: /--[^\n]*|\/\*[\s\S]*?\*\//y },
      { type: "string", pattern: /'(?:''|[^'])*'/y },
      { type: "keyword", pattern: /\b(?:SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|ALTER|DROP|INDEX|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|AS|AND|OR|NOT|NULL|PRIMARY|KEY|FOREIGN|REFERENCES|DISTINCT|COUNT|SUM|AVG|MIN|MAX|CASE|WHEN|THEN|ELSE|END|UNION|ALL|WITH|RETURNING)\b/iy },
      { type: "number", pattern: /\b\d+(?:\.\d+)?\b/y },
    ],
  },
  go: {
    rules: [
      { type: "comment", pattern: /\/\/[^\n]*|\/\*[\s\S]*?\*\//y },
      { type: "string", pattern: /"(?:\\.|[^"\\])*"|`[^`]*`/y },
      { type: "keyword", pattern: /\b(?:package|import|func|var|const|type|struct|interface|map|chan|go|defer|return|if|else|for|range|switch|case|default|break|continue|select|nil|true|false)\b/y },
      { type: "builtin", pattern: /\b(?:string|int|int64|float64|bool|byte|error|len|cap|make|new|append|fmt)\b/y },
    ],
  },
  rust: {
    rules: [
      { type: "comment", pattern: /\/\/[^\n]*|\/\*[\s\S]*?\*\//y },
      { type: "string", pattern: /"(?:\\.|[^"\\])*"/y },
      { type: "keyword", pattern: /\b(?:fn|let|mut|const|struct|enum|impl|trait|pub|use|mod|match|if|else|for|while|loop|return|self|Self|crate|where|async|await|move|ref|type|unsafe)\b/y },
      { type: "builtin", pattern: /\b(?:String|str|Vec|Option|Some|None|Result|Ok|Err|i32|i64|u32|u64|f32|f64|bool|usize)\b/y },
    ],
  },
  text: { rules: [] },
};

function jsGrammar(): Grammar {
  return {
    rules: [
      { type: "comment", pattern: /\/\/[^\n]*|\/\*[\s\S]*?\*\//y },
      { type: "string", pattern: /`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/y },
      { type: "keyword", pattern: new RegExp(`\\b(?:${JS_KEYWORDS})\\b`, "y") },
      { type: "number", pattern: /\b(?:0x[\da-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)n?\b/iy },
      { type: "builtin", pattern: new RegExp(`\\b(?:${JS_LITERALS}|console|window|document|Math|JSON|Object|Array|String|Number|Boolean|Promise|Map|Set|Date|RegExp|Error|fetch|process|require|module|exports|React|useState|useEffect|useRef|useMemo|useCallback)\\b`, "y") },
      { type: "tag", pattern: /<\/?[A-Za-z][\w.:-]*/y },
      { type: "property", pattern: /\b[A-Za-z_$][\w$]*(?=\s*[:(])/y },
    ],
  };
}
