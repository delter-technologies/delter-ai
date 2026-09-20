import { NextResponse, type NextRequest } from "next/server";

/**
 * Delter AI request boundary (Next.js 16 `proxy.ts`, the successor to
 * `middleware.ts`).
 *
 * Scope of responsibility — deliberately narrow:
 *
 *   This decides ROUTING. It stops a signed-out browser from rendering the
 *   workspace shell and stops a signed-in browser from being pushed back to the
 *   landing page. It is a UX and navigation contract, not the security boundary.
 *
 *   The security boundary is server-side, per route:
 *     - `src/app/(app)/layout.tsx` calls `requireUser()`, which validates the
 *       session token against the database (expiry + revocation) and redirects
 *       when it is not valid.
 *     - every `/api/**` handler calls `requireApiUser()` and then asserts
 *       ownership of the specific project / conversation / file being touched.
 *
 *   Reading the cookie here is therefore a fast pre-check only. A forged or
 *   expired cookie gets past this file and is rejected by the layout and the
 *   route handlers, which is exactly where the brief requires authorisation to
 *   live.
 *
 * Routing flow enforced:
 *   Landing → Authentication → Onboarding (only when required) → Workspace
 *   Returning authenticated user → Workspace, never onboarding again.
 */

const SESSION_COOKIE = "delter_session";

const PROTECTED_PREFIXES = ["/app", "/onboarding"];
const AUTH_PAGES = ["/signin", "/signup", "/forgot-password", "/reset-password"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  // 1. Protected workspace routes: no cookie → sign in, remembering the target.
  if (PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    if (!hasSession) {
      const url = request.nextUrl.clone();
      url.pathname = "/signin";
      url.search = "";
      const target = `${pathname}${search}`;
      // Only carry a target that is itself a protected route, so a stale value
      // can never bounce the user somewhere unexpected after sign-in.
      if (target.startsWith("/app")) url.searchParams.set("next", target);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // 2. Auth pages: an existing session goes straight into the workspace.
  if (AUTH_PAGES.some((page) => pathname === page)) {
    if (hasSession) {
      const url = request.nextUrl.clone();
      url.pathname = "/app";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // 3. Landing page: send a signed-in user into the product.
  if (pathname === "/" && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Match everything except static assets and images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)"],
};
