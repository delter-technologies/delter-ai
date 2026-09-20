/**
 * Client-side API helper.
 *
 * Every endpoint in Delter AI answers `{ ok: true, data }` or
 * `{ ok: false, error: { message } }`. This unwraps that once, so screens deal
 * in real values and real error messages instead of re-implementing response
 * handling — and so a failure always surfaces as a thrown `ClientApiError`
 * carrying the server's own wording.
 */

export class ClientApiError extends Error {
  status: number;
  code?: string;
  issues?: { field: string; message: string }[];
  /** Anything the server included for a retry/undo action. */
  extra: Record<string, unknown>;

  constructor(status: number, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.name = "ClientApiError";
    this.status = status;
    this.code = typeof extra.code === "string" ? extra.code : undefined;
    this.issues = Array.isArray(extra.issues) ? (extra.issues as { field: string; message: string }[]) : undefined;
    this.extra = extra;
  }

  /** True when trying again could plausibly succeed. */
  get retryable(): boolean {
    return this.status === 408 || this.status === 429 || this.status >= 500 || this.status === 0;
  }

  /** True when the session ended and the user must sign in again. */
  get isAuthError(): boolean {
    return this.status === 401;
  }
}

type Json = Record<string, unknown> | unknown[] | null;

async function parse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function request<T>(method: string, url: string, body?: Json | FormData): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      method,
      // FormData must set its own boundary; JSON needs an explicit header.
      ...(body instanceof FormData
        ? { body }
        : body !== undefined
          ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
          : {}),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch (error) {
    // Network failure before any response — say so instead of "Something went wrong".
    throw new ClientApiError(
      0,
      "Delter AI could not reach the server. Check your connection and try again.",
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }

  const payload = (await parse(response)) as
    | { ok: boolean; data?: T; error?: { message?: string } & Record<string, unknown> }
    | null;

  if (response.ok && payload && payload.ok === true) {
    return payload.data as T;
  }

  const message =
    payload?.error?.message ??
    (response.status === 401
      ? "Your session has ended. Please sign in again."
      : response.status === 404
        ? "That resource could not be found."
        : response.status === 413
          ? "That request was too large for the server to accept."
          : response.status >= 500
            ? "Delter AI hit a server error. Please retry."
            : `Request failed (HTTP ${response.status}).`);

  const { message: _ignored, ...extra } = (payload?.error ?? {}) as Record<string, unknown>;
  throw new ClientApiError(response.status, message, extra);
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: Json) => request<T>("POST", url, body),
  patch: <T>(url: string, body?: Json) => request<T>("PATCH", url, body),
  put: <T>(url: string, body?: Json) => request<T>("PUT", url, body),
  del: <T>(url: string, body?: Json) => request<T>("DELETE", url, body),
  upload: <T>(url: string, form: FormData) => request<T>("POST", url, form),
};

/** Build a query string, dropping null/undefined so URLs stay readable. */
export function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

/** Message pulled out of any thrown value, with a usable fallback. */
export function errorMessage(error: unknown, fallback = "Something failed. Please try again."): string {
  if (error instanceof ClientApiError) return error.message;
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error;
  return fallback;
}
