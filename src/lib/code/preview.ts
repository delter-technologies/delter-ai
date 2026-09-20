import "server-only";
import { languageFor } from "./languages";

/**
 * Code Studio preview builder.
 *
 * Source code, build and preview are kept separate:
 *   - source   → CodeFile rows in the database (never touched by this module)
 *   - build    → this module: resolves an entry point and rewrites relative
 *                references so the files can be served from the project root
 *   - preview  → an isolated route rendered inside a sandboxed iframe
 *
 * There is no build step for non-web projects and we do not pretend otherwise:
 * `previewStatus()` reports exactly why a project cannot be previewed.
 */

import type { PreviewCodeFile, PreviewStatus } from "./preview-status";

export type { PreviewCodeFile, PreviewStatus };

const HTML_ENTRIES = ["index.html", "public/index.html", "src/index.html", "app/index.html", "site/index.html"];
const MD_ENTRIES = ["README.md", "readme.md", "index.md"];

export function findEntry(files: PreviewCodeFile[], preferred?: string | null): string | null {
  const paths = new Set(files.map((f) => f.path));

  if (preferred && paths.has(preferred)) return preferred;

  for (const candidate of HTML_ENTRIES) if (paths.has(candidate)) return candidate;
  // Any HTML file, shallowest first.
  const html = files
    .filter((f) => languageFor(f.path).id === "html")
    .sort((a, b) => a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path));
  if (html[0]) return html[0].path;

  for (const candidate of MD_ENTRIES) if (paths.has(candidate)) return candidate;

  return null;
}

export function previewStatus(files: PreviewCodeFile[], preferred?: string | null): PreviewStatus {
  if (!files.length) {
    return {
      previewable: false,
      reason: "This project has no files yet.",
      hint: "Create a file in Code Studio — or start a new project from the Static website template.",
    };
  }

  const entry = findEntry(files, preferred);
  if (!entry) {
    const languages = Array.from(new Set(files.map((f) => languageFor(f.path).label))).join(", ");
    return {
      previewable: false,
      reason: `Nothing in this project can be rendered in a browser. It contains: ${languages}.`,
      hint: "Add an `index.html` to preview a web output. Code Studio does not compile TypeScript, JSX or Python — that needs a real build runtime.",
    };
  }

  const kind = languageFor(entry).id;
  if (kind === "html") return { previewable: true, entryPath: entry, mode: "html" };
  if (kind === "markdown") return { previewable: true, entryPath: entry, mode: "markdown" };
  return { previewable: true, entryPath: entry, mode: "asset" };
}

export type BuildOptions = {
  /** Absolute base URL that serves project files, e.g. "/api/projects/p1/preview-files". */
  assetBase: string;
};

export type BuiltPreview = {
  html: string;
  entryPath: string;
  mode: "html" | "markdown";
  /** Relative references that could not be resolved to a file in the project. */
  missing: string[];
};

const ABSOLUTE_URL = /^(https?:|data:|blob:|mailto:|tel:|#|\/\/)/i;

/**
 * Resolve a reference the way a browser serving the entry from the project
 * root would: leading "/" means project root, otherwise relative to the entry.
 */
export function resolveAssetPath(reference: string, entryPath: string): string {
  const clean = decodeURIComponent(reference.split(/[?#]/)[0]);
  if (!clean) return "";
  if (clean.startsWith("/")) return normalise(clean.slice(1));

  const entryDir = entryPath.includes("/") ? entryPath.slice(0, entryPath.lastIndexOf("/")) : "";
  return normalise(entryDir ? `${entryDir}/${clean}` : clean);
}

function normalise(p: string): string {
  const out: string[] = [];
  for (const segment of p.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") out.pop();
    else out.push(segment);
  }
  return out.join("/");
}

/** Build the document shown in the preview iframe. */
export function buildPreview(
  files: PreviewCodeFile[],
  entryPath: string,
  options: BuildOptions,
): BuiltPreview {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const entry = byPath.get(entryPath);
  if (!entry) {
    return {
      html: errorPage(`Preview entry “${escapeHtml(entryPath)}” is not in this project.`),
      entryPath,
      mode: "html",
      missing: [entryPath],
    };
  }

  if (languageFor(entryPath).id === "markdown") {
    return {
      html: markdownPage(entry.content, entryPath, files),
      entryPath,
      mode: "markdown",
      missing: [],
    };
  }

  const missing: string[] = [];
  const base = options.assetBase.replace(/\/$/, "");
  const urlFor = (reference: string) => {
    const resolved = resolveAssetPath(reference, entryPath);
    if (!resolved) return reference;
    if (!byPath.has(resolved)) {
      missing.push(reference);
      // Still emit a URL: the preview route returns an honest 404 page rather
      // than the browser silently swallowing the request.
    }
    return `${base}/${resolved.split("/").map(encodeURIComponent).join("/")}`;
  };

  let html = entry.content;

  // Rewrite link/script/img/source references that point inside the project.
  html = html.replace(
    /(<(?:link|script|img|source|video|audio|iframe|embed)\b[^>]*?\s(?:href|src)\s*=\s*)(["'])(.*?)\2/gi,
    (match, prefix, quote, reference: string) => {
      if (ABSOLUTE_URL.test(reference)) return match;
      // External stylesheets/scripts that are not project files stay untouched.
      if (!reference.includes(".") && !reference.startsWith("./")) return match;
      return `${prefix}${quote}${urlFor(reference)}${quote}`;
    },
  );

  // Inline <script type="module"> imports of relative project files.
  html = html.replace(/(<script\b[^>]*type\s*=\s*["']module["'][^>]*>)([\s\S]*?)(<\/script>)/gi, (_m, open, body: string, close) => {
    const rewritten = body.replace(
      /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])(\.{1,2}\/[^"']+)\2/g,
      (_s, kw, quote, spec: string) => `${kw}${quote}${urlFor(spec)}${quote}`,
    );
    return `${open}${rewritten}${close}`;
  });

  // CSS url(...) references inside <style> blocks.
  html = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open, body: string, close) => {
    const rewritten = body.replace(/url\(\s*(["']?)(?!data:|blob:|https?:|\/\/)([^"')]+)\1\s*\)/gi, (_s, quote, ref: string) => {
      if (ABSOLUTE_URL.test(ref)) return _s;
      return `url(${quote}${urlFor(ref)}${quote})`;
    });
    return `${open}${rewritten}${close}`;
  });

  // Relative hrefs in anchors would otherwise escape the project root.
  html = html.replace(/(<a\b[^>]*?\shref\s*=\s*)(["'])(?!https?:|mailto:|tel:|#|data:|\/\/)([^"']+)\2/gi, (match, prefix, quote, ref: string) => {
    if (ref.startsWith("#")) return match;
    const resolved = resolveAssetPath(ref, entryPath);
    return `${prefix}${quote}${base}/${resolved.split("/").map(encodeURIComponent).join("/")}${quote}`;
  });

  // <base href> so anything we missed still resolves inside the project.
  const baseTag = `<base href="${base}/">`;
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, (m) => `${m}${baseTag}`);
  } else if (/<html[^>]*>/i.test(html)) {
    html = html.replace(/<html([^>]*)>/i, (m) => `${m}<head>${baseTag}</head>`);
  } else {
    html = `<!doctype html><html><head>${baseTag}<meta charset="utf-8"></head><body>${html}</body></html>`;
  }

  return { html, entryPath, mode: "html", missing: Array.from(new Set(missing)) };
}

/* -------------------------------------------------------------------------- */
/* Markdown rendering                                                          */
/* -------------------------------------------------------------------------- */

/**
 * A small, dependency-free Markdown renderer for previewing `.md` files.
 * Everything is escaped first, then structure is applied — user content can
 * never inject markup into the preview document.
 */
export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inFence = false;
  let fenceLang = "";
  let fenceBody: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${inline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const line of lines) {
    const fence = line.match(/^\s*```(\w*)\s*$/);
    if (fence) {
      if (inFence) {
        out.push(`<pre><code class="lang-${escapeHtml(fenceLang || "text")}">${escapeHtml(fenceBody.join("\n"))}</code></pre>`);
        fenceBody = [];
        inFence = false;
      } else {
        flushParagraph();
        flushList();
        inFence = true;
        fenceLang = fence[1] ?? "";
      }
      continue;
    }
    if (inFence) {
      fenceBody.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      flushParagraph();
      flushList();
      out.push("<hr>");
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();
      out.push(`<blockquote>${inline(quote[1])}</blockquote>`);
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const unordered = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ordered || unordered) {
      flushParagraph();
      const wanted = ordered ? "ol" : "ul";
      if (listType !== wanted) {
        flushList();
        out.push(`<${wanted}>`);
        listType = wanted;
      }
      out.push(`<li>${inline((ordered ?? unordered)![1])}</li>`);
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  if (inFence && fenceBody.length) {
    out.push(`<pre><code>${escapeHtml(fenceBody.join("\n"))}</code></pre>`);
  }
  flushParagraph();
  flushList();

  return out.join("\n");
}

function inline(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|\W)\*([^*\n]+)\*/g, "$1<em>$2</em>");
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, href) => {
    const safe = /^(https?:|mailto:|#|\/)/i.test(href) ? href : "#";
    return `<a href="${safe}" target="_blank" rel="noreferrer noopener">${label}</a>`;
  });
  return html;
}

export function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function markdownPage(markdown: string, entryPath: string, files: PreviewCodeFile[]): string {
  const body = renderMarkdown(markdown);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(entryPath)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0b0d10; color: #e8ecf1;
         font: 15px/1.7 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 32px 24px 80px; }
  h1, h2, h3, h4 { letter-spacing: -0.02em; line-height: 1.25; margin: 1.6em 0 0.5em; }
  h1 { font-size: 28px; margin-top: 0; } h2 { font-size: 21px; } h3 { font-size: 17px; }
  p { margin: 0.8em 0; }
  a { color: #6ea8ff; }
  code { background: #161b22; border: 1px solid #232a32; border-radius: 4px; padding: 1px 5px;
         font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
  pre { background: #12161b; border: 1px solid #232a32; border-radius: 8px; padding: 14px 16px; overflow: auto; }
  pre code { background: none; border: 0; padding: 0; font-size: 13px; }
  blockquote { margin: 1em 0; padding: 2px 16px; border-left: 3px solid #2f3944; color: #a8b3bf; }
  hr { border: 0; border-top: 1px solid #232a32; margin: 2em 0; }
  ul, ol { padding-left: 22px; }
  li { margin: 0.3em 0; }
  .preview-note { font-size: 12px; color: #7d8894; border: 1px solid #232a32; border-radius: 8px;
                  padding: 8px 12px; margin-bottom: 24px; background: #12161b; }
</style>
</head>
<body>
<main>
  <div class="preview-note">Rendered from <strong>${escapeHtml(entryPath)}</strong> · ${files.length} file${files.length === 1 ? "" : "s"} in this project · Markdown preview, not a browser build</div>
  ${body}
</main>
</body>
</html>`;
}

export function errorPage(message: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Preview</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         background: #0b0d10; color: #e8ecf1;
         font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  .card { max-width: 460px; padding: 24px; border: 1px solid #2a2118; border-radius: 12px; background: #14110d; }
  h1 { font-size: 16px; margin: 0 0 8px; color: #f0b429; }
  p { margin: 0; color: #b9a68a; font-size: 14px; }
</style>
</head>
<body>
  <div class="card">
    <h1>Preview could not load this file</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
}
