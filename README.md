# Delter AI

A unified AI workspace from **Delter Technologies**: chat, projects, files and a code
studio that share one account, one conversation history and one model picker.

The rule this codebase follows is that every visible control does something real.
There are no placeholder buttons, no invented statistics, and no silent fallbacks —
when a capability does not exist yet, or a provider refuses a request, the interface
says so in plain words and names the next step.

---

## What is built and working

| Area | Status |
| --- | --- |
| Landing, sign up, sign in, password reset, sessions | Working. Server-side session rows, hashed passwords (`bcryptjs`), revocable sessions, "sign out everywhere". Reset emails are not wired to a sender yet, and the UI says so instead of pretending to send. |
| Onboarding | Working. Shown once, then `/onboarding` redirects to the workspace for good. |
| Workspace routing | Working. Signed-out visitors are sent to `/signin` with the target preserved in `next`; signed-in visitors go straight to `/app`. `next` is validated against open redirects and path traversal. |
| Chat | Working. Streaming replies over SSE, conversation history, rename, delete, retry, stop, attached-file context, automatic titles. |
| Files | Working. Real uploads to disk with progress, per-file failures, unsupported-format and empty states, text extraction for AI context. |
| Projects | Working. Create, rename, archive, delete, per-user isolation. |
| Code Studio | Working. Database-backed files, editor (CodeMirror 6), file explorer, AI assistant that reads the open file and writes file operations back through a transactional apply endpoint, live preview for web projects, honest terminal output. |
| Settings | Working. Five tabs over real endpoints: profile, appearance & AI, security (live session list, password change), usage (metered events), account. Billing reports itself as not enabled rather than showing dead controls. |
| AI provider layer | Working. One server-side abstraction over OpenRouter, OpenAI, Anthropic and a built-in offline demo responder. Keys never reach the browser. Provider failures are classified from the provider's own message (billing, auth, missing model, context length, moderation, rate limit) and mapped to an actionable sentence with the correct `retryable` flag. |
| Usage metering | Working. Every metered operation writes a `UsageEvent` at the moment work happens; the Usage screen reads those rows. |

### Roadmap (not built yet)

Image Studio, Website Builder, Research, Presentations, Spreadsheets, Automations,
Integrations & API, and Billing. Each of these currently renders an explicit
"not built yet" state from the shared tool registry — it never fakes a result.

---

## Stack

- **Next.js 16** (App Router, Turbopack) with **React 19** and **TypeScript**
- **Prisma 6** on **SQLite** (single file, zero setup; see [Deployment](#deployment))
- **Tailwind CSS 4** with a small hand-rolled component set (`Button`, `Field`, `Modal`, `Menu`, `States`, `Markdown`)
- **CodeMirror 6** for the code editor
- **zod** for validation, **bcryptjs** for password hashing
- No UI kit, no analytics, no third-party runtime dependencies beyond the above

---

## Quick start

```bash
npm install
cp .env.example .env       # then fill in SESSION_SECRET and at least one provider key
npm run setup              # prisma generate + db push + create runtime dirs
npm run dev                # http://localhost:3000
```

`npm run setup` creates `data/db.sqlite` and `data/storage/`. Both are git-ignored:
the database and every uploaded file live under `data/`.

Other scripts: `npm run build`, `npm start`, `npm run typecheck`, `npm run db:studio`.

---

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Prisma datasource. Defaults to `file:../data/db.sqlite`. |
| `SESSION_SECRET` | Signs and verifies session cookies. Required in production; the dev fallback is deliberately labelled as unsafe. |
| `OPENROUTER_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Provider credentials, read server-side at request time. Provide at least one. |
| `OPENROUTER_APP_NAME` / `OPENROUTER_APP_URL` | Attribution headers OpenRouter asks for. |
| `MAX_UPLOAD_MB` | Upload cap (default 25). |
| `AI_MAX_OUTPUT_TOKENS` | Default output cap per request (default 2048). See below — this one matters for money. |
| `RESET_EMAIL_URL` | Where password-reset links point. Unset means no email delivery, which the UI states plainly. |

### Why `AI_MAX_OUTPUT_TOKENS` exists

Providers that pre-authorise credit hold `max_tokens × output price` before they
start. Sending a request with no cap makes OpenRouter assume the model's maximum
(64,000 tokens for Claude Sonnet) and refuse it outright:

> "This request requires more credits, or fewer max_tokens. You requested up to
> 64000 tokens, but can only afford 2662."

Capping the output makes premium models usable on a small balance. Raise it for long
code generation; when a reply does hit the cap, the chat says "Reply cut off at the
output limit" instead of presenting a truncated answer as complete.

---

## How the AI layer behaves

- `src/lib/ai/registry.ts` resolves which model actually serves a request: the one
  asked for, else the user's saved default, else the first configured provider's
  chat model, else the offline demo responder.
- A substitution is only reported as a *fallback* when a specific model was actually
  requested — otherwise every new user would be warned about a change that never
  happened.
- The demo provider is a deterministic local responder. It is labelled as such
  everywhere it appears; it is never presented as a language model.
- Streaming uses SSE with `meta`, `delta`, `done` and `error` events. `meta` carries
  the provider, model, demo and fallback facts for the message being written.
- Reasoning models that spend their whole output budget thinking (and emit no visible
  text) raise an explicit retryable error rather than storing a blank reply.

---

## Architecture notes

- **Ownership is the spine of the schema.** Every user-owned row carries `userId` and
  every server-side query is scoped by it, so "user A cannot reach user B's data" is a
  database-level guarantee rather than a UI convention. IDs in URLs are always
  re-checked against the session.
- **Two layers of access control.** `src/proxy.ts` does a cheap cookie-presence check
  for redirects only; real authorisation happens in `(app)/layout.tsx` and in every
  route handler via `requireApiUser()`.
- **Stateless across requests.** Sessions live in the database and code-preview tokens
  are HMAC-signed with an expiry, so nothing depends on in-memory state.
- **API contract.** Every endpoint answers `{ ok: true, data }` or
  `{ ok: false, error: { message, … } }`; `src/lib/client/api.ts` unwraps that once so
  screens deal in real values and the server's own error wording.
- **Uploads** are written to local disk by `src/lib/storage.ts` (see Deployment).

---

## Deployment

`npm run build` passes (Prisma client generation is part of the build script, so the
git-ignored generated client is produced on the host).

Two things change when moving off a machine with a real filesystem:

1. **SQLite → Postgres.** Serverless filesystems are read-only and ephemeral. Point
   `datasource db` at `postgresql`, set `DATABASE_URL`, run `prisma db push`. The app
   contains no raw SQL and no SQLite-specific date handling, so no query changes are
   needed.
2. **Local uploads → object storage.** `src/lib/storage.ts` writes with `node:fs`.
   Swap its three functions (`storeFile`, `readFileBytes`, `deleteStoredFile`) for an
   S3/R2/Blob driver; callers are unaffected.

Alternatively, run it as a plain Node server (`npm start`) on any host with a persistent
volume — then SQLite and local uploads both keep working, and long streaming responses
are not subject to serverless function timeouts. Note that `src/app/api/ai/stream`
declares `maxDuration = 300`, which hosts clamp to their own plan limits.

AI model access is never included by a host: at least one provider key with credit is
required for live responses.

---

## Project layout

```
prisma/schema.prisma     data model (users, sessions, projects, conversations,
                         messages, files, code files, usage events)
src/proxy.ts             cookie-presence redirects
src/lib/                 config, db, auth, api helpers, validation, storage, usage,
                         tools registry, device descriptions
src/lib/ai/              provider abstraction: registry, types, errors, context,
                         providers/{openrouter,openai,anthropic,demo}
src/lib/code/            code file paths, languages, preview status, signed tokens
src/app/                 routes: landing, auth, onboarding, (app) workspace, api
src/components/          workspace shell, chat, code studio, files, projects,
                         settings, ui primitives, system providers
```

---

## Security notes

- `.env`, `data/` and `src/generated/` are git-ignored. No credential is committed,
  and provider keys are only ever read inside server-side modules.
- Password reset and session cookies are hashed with `SESSION_SECRET`; the stored
  values are not reversible.
- Redirect targets are validated (`safeNextPath`) against external hosts,
  protocol-relative URLs and `..` traversal in both raw and percent-decoded form.

## License

Not chosen yet.
