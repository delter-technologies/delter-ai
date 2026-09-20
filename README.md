# Delter AI

A unified AI workspace from **Delter Technologies**: chat, projects, files and a code
studio that share one account, one conversation history and one model picker.

The rule this codebase follows is that every visible control does something real.
There are no placeholder buttons, no invented statistics, and no silent fallbacks —
when a capability does not exist yet, or a provider refuses a request, the interface
says so in plain words and names the next step.

```bash
git clone https://github.com/delter-technologies/delter-ai.git
```

**Contents** — [Status](#what-is-built-and-working) · [Stack](#stack) ·
[Quick start](#quick-start) · [Environment](#environment) ·
[AI layer](#how-the-ai-layer-behaves) · [Architecture](#architecture-notes) ·
[Deployment](#deploying-this-repository) · [Layout](#project-layout) ·
[Security](#security-notes)

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
- **Prisma 6** on **PostgreSQL** — no raw SQL anywhere, so the provider is one line
  in `prisma/schema.prisma` (this codebase ran on SQLite during development)
- **@aws-sdk/client-s3** behind a storage-driver interface, so uploads go to local
  disk or to any S3-compatible object store without touching a caller
- **Tailwind CSS 4** with a small hand-rolled component set (`Button`, `Field`, `Modal`, `Menu`, `States`, `Markdown`)
- **CodeMirror 6** for the code editor
- **zod** for validation, **bcryptjs** for password hashing
- No UI kit, no analytics, no third-party runtime dependencies beyond the above

---

## Quick start

Requires Node 20.9 or newer.

```bash
git clone https://github.com/delter-technologies/delter-ai.git
cd delter-ai
npm install

# A PostgreSQL server to point at. Docker is the quickest locally; a free Neon or
# Supabase database works identically (see DEPLOY.md).
docker run --name delter-pg -e POSTGRES_PASSWORD=delter -e POSTGRES_DB=delter_ai \
  -p 5432:5432 -d postgres:17

cp .env.example .env       # DATABASE_URL, SESSION_SECRET, at least one provider key
npm run setup              # prisma generate + db push + create runtime dirs
npm run dev                # http://localhost:3000
```

Uploads default to local disk under `data/storage/` (git-ignored). Set
`STORAGE_DRIVER=s3` to put them in an object store instead — required on a
serverless host, where the filesystem is read-only and per-request.

Verified on Node 20 against PostgreSQL 17: `npm run setup` creates the schema,
`npm run typecheck` reports no errors, `npm run build` completes with every route,
and **both storage drivers** were exercised end to end (upload → download → storage
meter → delete) against a real S3-compatible endpoint. The failure path is verified
too: when the store refuses a write, the upload is reported as failed with the
store's own reason and **no** `FileAsset` row is created.

Other scripts: `npm start`, `npm run db:push`, `npm run db:studio`.

---

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. On a serverless host use the **pooled** URL (Neon's `-pooler` host): per-request scaling exhausts a direct connection limit. |
| `SESSION_SECRET` | Signs and verifies session cookies. Required in production; the dev fallback is deliberately labelled as unsafe. |
| `OPENROUTER_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Provider credentials, read server-side at request time. Provide at least one. |
| `OPENROUTER_APP_NAME` / `OPENROUTER_APP_URL` | Attribution headers OpenRouter asks for. |
| `MAX_UPLOAD_MB` | Upload cap (default 25). |
| `AI_MAX_OUTPUT_TOKENS` | Default output cap per request (default 2048). See below — this one matters for money. |
| `RESET_EMAIL_URL` | Where password-reset links point. Unset means no email delivery, which the UI states plainly. |
| `STORAGE_DRIVER` | `local` (default, disk under `STORAGE_ROOT`) or `s3` (any S3-compatible object store). An unrecognised value throws rather than silently falling back to disk. |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` | Object store location. R2 uses `https://<account-id>.r2.cloudflarestorage.com` with region `auto`; omit the endpoint for AWS S3. |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Object store credentials. Server-side only; never echoed in an error message or in the Settings description. |
| `S3_PREFIX` / `S3_FORCE_PATH_STYLE` | Optional key prefix (one bucket, several environments) and addressing style (path-style is what R2, Supabase and MinIO expect). |

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
- **Uploads sit behind a driver interface.** `src/lib/storage.ts` keeps metadata
  handling, sanitising and text extraction; `src/lib/storage-drivers/` holds the
  `local` and `s3` implementations. A driver must confirm bytes landed before the
  caller writes a row, so a failed upload can never look like a successful one.

---

## Deploying this repository

Full step-by-step instructions, including free-tier database and object-storage
setup, live in **[DEPLOY.md](DEPLOY.md)**. The short version:

`npm run build` passes, and the build script runs `prisma generate` first, so the
git-ignored Prisma client is produced on the host rather than committed.

### On Vercel

1. [vercel.com/new](https://vercel.com/new) → import `delter-technologies/delter-ai`
2. Framework preset: **Next.js** (auto-detected). Build command `npm run build`,
   output directory `.next` — both defaults, nothing to override.
3. Add the environment variables: `DATABASE_URL` (pooled Postgres),
   `SESSION_SECRET`, `STORAGE_DRIVER=s3` plus the `S3_*` values, and at least one
   AI provider key.
4. Deploy, then run the post-deploy checklist in DEPLOY.md.

The schema is already PostgreSQL and the object-storage driver is already written,
so deploying is configuration, not a rewrite. Two things still deserve attention:

- **Streaming duration.** `src/app/api/ai/stream` declares `maxDuration = 300`,
  which serverless hosts clamp to their plan limit (10 s on Vercel Hobby, 60 s with
  Fluid compute). A long generation can be cut off at that boundary.
- **Migrations.** The schema is applied with `prisma db push`, which is right for
  development. Before a production database holds data you care about, adopt
  `prisma migrate dev` → `prisma migrate deploy` so changes are versioned.

### Or as a plain Node server

Run `npm start` on any host with a persistent volume (Railway, Fly.io, Render, a
VPS). `STORAGE_DRIVER=local` keeps working there, no object store is needed, and
long streaming responses are not subject to serverless function timeouts.

Either way, AI model access is never included by a host: at least one provider key
**with credit** is required for live responses. A key that authenticates but has no
balance produces an explicit billing message in the UI, not a silent failure — check
it from Settings → Appearance & AI → Providers → Test.

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
src/lib/storage-drivers/ local-disk and S3-compatible object storage drivers
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
- Storage keys are server-generated (`<userId>/<fileId><ext>`) and resolved with a
  containment check; object-store credentials never appear in an error message or in
  the Settings storage description.

## License

Not chosen yet.
