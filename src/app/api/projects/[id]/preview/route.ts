import { prisma } from "@/lib/db";
import { assertProjectOwnership, requireApiUser } from "@/lib/auth";
import { handleRoute } from "@/lib/api";
import { buildPreview, escapeHtml, previewStatus } from "@/lib/code/preview";
import { createPreviewToken } from "@/lib/code/preview-token";
import type { RouteContext } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

/**
 * GET /api/projects/:id/preview?entry=<path>
 *
 * Returns the document rendered inside the sandboxed preview iframe.
 *
 * The three concerns stay separate, as the brief requires:
 *   - source   → CodeFile rows; this route never writes to them
 *   - build    → resolve an entry point, rewrite relative references
 *   - preview  → this isolated route, framed with sandbox="allow-scripts" and no
 *                allow-same-origin, so project code cannot touch Delter AI's own
 *                cookies, storage or DOM.
 *
 * When a project cannot be previewed, the response explains exactly why and what
 * to do. It never renders a blank pane and never fakes a build.
 */

const PAGE_STYLES = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; background:#0b0d10; color:#e8ecf1;
         font:15px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  .delter-preview-shell { max-width:640px; margin:0 auto; padding:32px 24px; }
  .delter-tag { display:inline-block; font-size:11px; letter-spacing:.06em; text-transform:uppercase;
                color:#8b95a1; border:1px solid #232a32; border-radius:999px; padding:3px 10px; margin-bottom:14px; }
  h1 { font-size:18px; margin:0 0 10px; letter-spacing:-.01em; }
  p { margin:0 0 10px; color:#9aa5b1; font-size:14px; }
  code { background:#12161b; border:1px solid #232a32; border-radius:4px; padding:1px 5px;
         font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12.5px; color:#c8d2dd; }
  .delter-banner { border:1px solid #3a3320; background:#16130b; color:#e0c98a; border-radius:8px;
                   padding:10px 12px; font-size:12.5px; margin-bottom:18px; }
  .delter-banner strong { color:#f2dfa8; }
`;

function standalonePage(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${PAGE_STYLES}</style>
</head>
<body><div class="delter-preview-shell">${bodyHtml}</div></body>
</html>`;
}

function respond(html: string, headers: Record<string, string> = {}): Response {
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      // Allow the sandboxed iframe to frame this; the app shell itself refuses framing.
      "content-security-policy": "frame-ancestors *",
      ...headers,
    },
  });
}

export const GET = handleRoute(async (request: Request, context: RouteContext<Params>) => {
  const { user } = await requireApiUser();
  const { id } = await context.params;

  const project = await assertProjectOwnership(user.id, id);
  const url = new URL(request.url);
  const requestedEntry = url.searchParams.get("entry");

  const files = await prisma.codeFile.findMany({
    where: { projectId: project.id, userId: user.id },
    select: { path: true, content: true },
  });

  const status = previewStatus(files, requestedEntry);

  if (!status.previewable) {
    return respond(
      standalonePage(
        "Preview unavailable",
        `<span class="delter-tag">Preview unavailable</span>
         <h1>${escapeHtml(status.reason)}</h1>
         ${status.hint ? `<p>${escapeHtml(status.hint)}</p>` : ""}
         <p style="margin-top:18px;color:#6f7a86;font-size:13px">Code Studio renders HTML, CSS, JavaScript and Markdown straight from your saved files. It does not compile TypeScript, JSX or Python — that needs a real build runtime, and Delter AI will not pretend to have one.</p>`,
      ),
    );
  }

  const entryPath = status.entryPath;
  const token = createPreviewToken(user.id, project.id);

  // Serve project files relative to the entry file's directory, exactly like a
  // web server rooted there. `base` carries that directory to the file route.
  const entryDir = entryPath.includes("/") ? entryPath.slice(0, entryPath.lastIndexOf("/") + 1) : ".";

  // buildPreview appends "/<encoded path>" to assetBase. The file route reads the
  // project-relative path from the `path` query parameter, so ending assetBase
  // with "&path=" makes the two agree without any post-processing of the markup.
  const search = new URLSearchParams({ token, base: entryDir });
  const assetBase = `/api/projects/${encodeURIComponent(project.id)}/preview-files?${search.toString()}&path=`;

  const built = buildPreview(files, entryPath, { assetBase });

  // buildPreview emitted `${assetBase}${encoded}` where encoded is
  // "/a/b.css" (slash-separated). Collapse that leading slash into `&path=`.
  const html = built.html.split(`${assetBase}/`).join(`${assetBase.replace(/=$/, "")}=`);

  const banner = built.missing.length
    ? `<div class="delter-banner"><strong>${built.missing.length} reference${built.missing.length === 1 ? "" : "s"} in ${escapeHtml(entryPath)} did not resolve to a file in this project:</strong> ${escapeHtml(built.missing.slice(0, 6).join(", "))}${built.missing.length > 6 ? ", …" : ""}. The preview still rendered everything else.</div>`
    : "";

  let finalHtml = html;
  if (banner) {
    if (/<body[^>]*>/i.test(finalHtml)) {
      finalHtml = finalHtml.replace(/<body([^>]*)>/i, (match) => `${match}${wrapBanner(banner)}`);
    } else {
      finalHtml = banner + finalHtml;
    }
  }

  return respond(finalHtml, {
    "x-delter-preview-entry": entryPath,
    "x-delter-preview-mode": built.mode,
  });
});

/** Keep the banner out of the user's own layout flow as much as possible. */
function wrapBanner(banner: string): string {
  return `<div style="all:initial;display:block">${banner}<style>${PAGE_STYLES}</style></div>`;
}
