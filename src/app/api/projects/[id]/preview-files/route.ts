import { prisma } from "@/lib/db";
import { assertProjectOwnership, requireApiUser } from "@/lib/auth";
import { handleRoute } from "@/lib/api";
import { verifyPreviewToken } from "@/lib/code/preview-token";
import { languageFor } from "@/lib/code/languages";
import type { RouteContext } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

/**
 * GET /api/projects/:id/preview-files?token=…&base=<dir>&path=<project path>
 *
 * Serves one project file to the sandboxed preview iframe.
 *
 * The iframe runs with `sandbox="allow-scripts"` and no `allow-same-origin`, so
 * it is a unique origin and the browser will not send the session cookie with
 * its stylesheet/script/image requests. A signed preview token (HMAC over
 * user + project + expiry) authorises those sub-resource requests instead.
 * The token cannot be forged, cannot be widened to another project, and expires
 * in 15 minutes.
 */

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  cjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  webmanifest: "application/manifest+json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  wasm: "application/wasm",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

function contentTypeFor(filePath: string, language: string): string {
  const ext = filePath.includes(".") ? filePath.slice(filePath.lastIndexOf(".") + 1).toLowerCase() : "";
  if (CONTENT_TYPES[ext]) return CONTENT_TYPES[ext];
  // Anything Code Studio knows as a text language is served as text so a browser
  // does not try to interpret it as a download.
  if (language !== "text") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function notFoundPage(reference: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Not found</title>
<style>body{margin:0;padding:16px;background:#0b0d10;color:#e8ecf1;font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}
span{color:#f0b429}</style></head>
<body><span>404</span> — “${reference.replace(/[<>&"]/g, "")}” is not a file in this project.</body></html>`;
}

export const GET = handleRoute(async (request: Request, context: RouteContext<Params>) => {
  const { user } = await requireApiUser();
  const { id } = await context.params;
  const url = new URL(request.url);

  const project = await assertProjectOwnership(user.id, id);

  const tokenCheck = verifyPreviewToken(url.searchParams.get("token"), {
    userId: user.id,
    projectId: project.id,
  });
  if (!tokenCheck.ok) {
    return new Response(
      `<!doctype html><html><head><meta charset="utf-8"><title>Preview expired</title>
<style>body{margin:0;padding:16px;background:#0b0d10;color:#e8ecf1;font:13px/1.6 ui-sans-serif,system-ui,sans-serif}span{color:#f0b429}</style>
</head><body><span>Preview link expired</span> — reload the Preview tab in Code Studio to get a fresh one.</body></html>`,
      { status: 403, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
    );
  }

  const rawPath = url.searchParams.get("path") ?? "";
  const base = url.searchParams.get("base") ?? ".";

  // A leading "/" in the document means project root; otherwise resolve relative
  // to the entry file's directory, like a web server would.
  const normalise = (segments: string[]) => {
    const out: string[] = [];
    for (const segment of segments) {
      if (!segment || segment === ".") continue;
      if (segment === "..") out.pop();
      else out.push(segment);
    }
    return out.join("/");
  };

  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    decoded = rawPath;
  }

  // A leading "/" means project root; otherwise resolve against the entry file's
  // directory, exactly like a web server rooted there would. `normalise` drops
  // "." and empty segments, so a base of "." or "" both mean the project root.
  const baseSegments = base ? base.split("/") : [];
  const resolved = decoded.startsWith("/")
    ? normalise(decoded.split("/"))
    : normalise([...baseSegments, ...decoded.split("/")]);

  const headers: Record<string, string> = {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };

  if (!resolved) {
    return new Response(notFoundPage(rawPath || "(empty path)"), {
      status: 404,
      headers: { ...headers, "content-type": "text/html; charset=utf-8" },
    });
  }

  const file = await prisma.codeFile.findFirst({
    where: { projectId: project.id, userId: user.id, path: resolved },
    select: { path: true, content: true, language: true },
  });

  if (!file) {
    return new Response(notFoundPage(resolved), {
      status: 404,
      headers: { ...headers, "content-type": "text/html; charset=utf-8" },
    });
  }

  const language = file.language || languageFor(file.path).id;
  const body = Buffer.from(file.content, "utf8");

  return new Response(new Uint8Array(body), {
    headers: {
      ...headers,
      "content-type": contentTypeFor(file.path, language),
      "content-length": String(body.length),
      "x-delter-preview-file": file.path,
    },
  });
});
