import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "@/lib/auth";

/**
 * Route-handler helpers.
 *
 * Every API route in Delter AI goes through `handleRoute`, which guarantees:
 *   - a thrown ApiError becomes its own status code and message
 *   - a Zod failure becomes a 400 listing the offending fields
 *   - anything unexpected becomes a 500 with a useful sentence, and the real
 *     error is logged server-side (never leaked to the client)
 *   - JSON responses are never cached
 */

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, {
    ...init,
    headers: { "cache-control": "no-store", ...(init?.headers ?? {}) },
  });
}

export function ok<T>(data: T): NextResponse {
  return json({ ok: true, data });
}

export function fail(status: number, message: string, extra?: Record<string, unknown>): NextResponse {
  return json({ ok: false, error: { message, ...(extra ?? {}) } }, { status });
}

export function fromZodError(error: ZodError): NextResponse {
  const issues = error.issues.slice(0, 8).map((issue) => ({
    field: issue.path.join(".") || "(body)",
    message: issue.message,
  }));
  const summary = issues.map((i) => `${i.field}: ${i.message}`).join(" · ");
  return fail(400, `Please check your input — ${summary}`, { issues });
}

export type RouteContext<Params extends Record<string, string | string[]> = Record<string, string | string[]>> = {
  params: Promise<Params>;
};

type Handler<Params extends Record<string, string | string[]>> = (
  request: Request,
  context: RouteContext<Params>,
) => Promise<Response> | Response;

export function handleRoute<Params extends Record<string, string | string[]>>(handler: Handler<Params>): Handler<Params> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof ApiError) {
        return fail(error.status, error.message, error.details ? { details: error.details } : undefined);
      }
      if (error instanceof ZodError) {
        return fromZodError(error);
      }
      if (error instanceof Error && error.name === "AbortError") {
        return fail(499, "The request was cancelled.");
      }

      const requestId = Math.random().toString(36).slice(2, 10);
      console.error(`[delter-ai] ${request.method} ${new URL(request.url).pathname} failed (${requestId}):`, error);
      return fail(
        500,
        "Delter AI hit an unexpected server error while handling that request. Please retry — if it keeps happening, note the reference code.",
        { requestId },
      );
    }
  };
}

/** Parse a JSON body, or throw an ApiError the user can understand. */
export async function readJson<T = unknown>(request: Request): Promise<T> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    throw new ApiError(400, "Delter AI could not read that request. Please try again.");
  }
  if (!raw.trim()) throw new ApiError(400, "The request body was empty.");
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ApiError(400, "The request body was not valid JSON.");
  }
}

export async function parseParams<Params extends Record<string, string | string[]>>(
  context: RouteContext<Params>,
): Promise<Params> {
  return context.params;
}

/** Reject requests whose body is larger than the configured upload cap. */
export function assertBodySize(request: Request, maxBytes: number) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared && declared > maxBytes) {
    throw new ApiError(413, `That request is too large. The limit is ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }
}
