# Deploying Delter AI

This is the operational guide. [README.md](README.md) explains what the product is;
this file explains how to put it on the internet, what each setting does, and what
still has limits.

Everything below was verified against this codebase, not copied from a template.
Where something could not be verified without an account (a specific managed
provider's dashboard), it says so.

---

## What you need

| Piece | Free option | Required? |
| --- | --- | --- |
| Hosting | Vercel Hobby, or any Node host (Railway, Fly.io, Render) | Yes |
| PostgreSQL | Neon free tier, Supabase free tier | Yes |
| Object storage | Cloudflare R2 (10 GB), Supabase Storage (1 GB) | Only when `STORAGE_DRIVER=s3` — required on serverless |
| Password-reset email | Resend (3k/month) | No — but without `RESET_EMAIL_URL`, production creates no reset token at all and the UI says so |
| AI provider credit | none; OpenRouter credit is the cheapest single top-up | Yes, for live AI |

AI credit is the only unavoidable cost. A key that authenticates with an empty
balance is not a bug and cannot be fixed in code — Settings → Appearance & AI →
Providers → **Test** shows the provider's own refusal and where to top up.

---

## 1. Database

The schema is PostgreSQL (`prisma/schema.prisma`). No query in the app is
provider-specific — there is no raw SQL — so any managed Postgres works.

**Neon**: create a project → Connection Details → copy the **pooled** string
(host ends in `-pooler`). Pooled matters on serverless: each function instance
opens its own connections, and a direct connection string hits the database's
connection limit under load.

**Supabase**: create a project → Project Settings → Database → Connection string
(URI). Use the session-pooler host/port if you are deploying to serverless.

**Local (Docker)**:

```bash
docker run --name delter-pg -e POSTGRES_PASSWORD=delter -e POSTGRES_DB=delter_ai \
  -p 5432:5432 -d postgres:17
# DATABASE_URL="postgresql://postgres:delter@127.0.0.1:5432/delter_ai"
```

Apply the schema once the URL is set.

**Production** — the repository carries a committed initial migration
(`prisma/migrations/0_init`), so a fresh production database is created from a
reviewed artefact:

```bash
DATABASE_URL="postgresql://…" npx prisma migrate deploy   # or: npm run db:migrate
```

Verified against an empty PostgreSQL 17 database: all ten tables, their indexes and
foreign keys are created, and `prisma migrate diff` then reports no difference
between the database and `prisma/schema.prisma`.

**Development** — `db push` is the quicker loop and needs no migration history:

```bash
DATABASE_URL="postgresql://…" npx prisma db push          # or: npm run setup
```

> Later schema changes: run `prisma migrate dev --name <change>` so a new migration
> is committed alongside the schema, and let the host apply it with
> `prisma migrate deploy`. Once a database holds data you care about, avoid
> `db push` — it diffs live rather than replaying reviewed SQL.

---

## 2. Object storage (`STORAGE_DRIVER=s3`)

Skip this section if you deploy on a host with a persistent volume and keep
`STORAGE_DRIVER=local`.

The driver uses exactly five S3 operations, so a bucket policy must allow:

```
s3:PutObject  s3:GetObject  s3:DeleteObject  s3:ListBucket  (+ HeadObject)
```

Objects are keyed `<prefix>/<userId>/<fileId><ext>`. Keys are server-generated;
nothing is derived from a user-supplied filename.

**Cloudflare R2**
- Create a bucket (e.g. `delter-ai-uploads`).
- R2 → API → Manage API Tokens → Create token: permission *Object Read & Write*,
  restricted to that bucket.
- `S3_ENDPOINT` = `https://<account-id>.r2.cloudflarestorage.com`
  (shown on the API tokens page), `S3_REGION=auto`, and the generated key pair as
  `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`.

**Supabase Storage**
- Create a bucket, then Storage → Access Keys → New access key.
- `S3_ENDPOINT` = `https://<project-ref>.storage.supabase.co`, `S3_REGION` = your
  project region, `S3_BUCKET` = the bucket name.

**AWS S3**
- Create a bucket and an IAM user with the five permissions above.
- Leave `S3_ENDPOINT` unset and set `S3_REGION` (e.g. `eu-west-1`).

`S3_PREFIX` is optional and worth using: `prod` / `staging` in one bucket keeps
environments apart. `S3_FORCE_PATH_STYLE` defaults to `true`, which is what R2,
Supabase and MinIO expect; set it to `false` only if your endpoint requires
virtual-hosted-style addressing.

A misconfigured driver fails loudly rather than quietly: a missing `S3_BUCKET`
produces an error naming the variable, an unrecognised `STORAGE_DRIVER` value throws
instead of falling back to disk, and a refused write surfaces the store's own reason
in the upload UI — with no `FileAsset` row created, so the file list never claims an
upload that did not happen.

Two further refusals matter on a serverless host:

- **`STORAGE_DRIVER` must be set explicitly in production.** Development defaults to
  `local` so a fresh clone works; production does not guess, because defaulting to
  disk on a serverless host would accept uploads and then lose them when the
  container is recycled.
- **`STORAGE_DRIVER=local` is refused when `VERCEL` is set**, with an error that
  explains the read-only, per-request filesystem and points at `s3`. Run on a host
  with a persistent volume if you want local disk.

---

## 3. Environment variables

| Variable | Example | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://user:pass@host-pooler/db?sslmode=require` | Pooled URL on serverless |
| `SESSION_SECRET` | 32+ random bytes | **Required in production**; `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `STORAGE_DRIVER` | `s3` | **Required in production**; `local` only on a host with a persistent volume, and never on Vercel |
| `S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` | Omit for AWS S3 |
| `S3_REGION` | `auto` | R2 uses `auto`; AWS uses a real region |
| `S3_BUCKET` | `delter-ai-uploads` | |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | | Server-side only |
| `S3_PREFIX` | `prod` | Optional |
| `S3_FORCE_PATH_STYLE` | `true` | Optional |
| `OPENROUTER_API_KEY` | `sk-or-v1-…` | At least one provider key |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | | Optional; each needs credit |
| `OPENROUTER_APP_NAME` / `OPENROUTER_APP_URL` | `Delter AI` / `https://your-domain` | Attribution headers |
| `AI_MAX_OUTPUT_TOKENS` | `2048` | See README — uncapped requests get refused by credit-holding providers |
| `MAX_UPLOAD_MB` | `25` | |
| `RESET_EMAIL_URL` | `https://your-delivery-endpoint/send` | A POST endpoint that sends the email. Unset in production = no reset token is created |

`SESSION_SECRET` rotation signs out every session immediately — that is the intended
behaviour, not a bug.

### Production guards

These are refusals, not fallbacks. Each one exists because the alternative would
look like a working deployment while behaving dangerously.

| Situation | What happens |
| --- | --- |
| `SESSION_SECRET` unset or shorter than 32 characters in production | The request fails with an error naming the variable and how to generate one. Session and reset tokens are HMAC-signed with it, and the development fallback is public in this repository. |
| `SESSION_SECRET` unset in development | The server starts with the labelled development fallback and warns once in the log. |
| `STORAGE_DRIVER` unset in production | Uploads fail with an error naming the variable (and pointing at `s3` when `VERCEL` is set). |
| `STORAGE_DRIVER=local` on Vercel | Refused with an explanation: the filesystem is read-only and per-request. |
| `RESET_EMAIL_URL` unset in production | No reset token is created. The response is identical for every address, so the endpoint cannot be used to enumerate accounts, and the UI states that reset is unavailable. |
| `RESET_EMAIL_URL` unset in development | The reset link is returned in the response and shown in the UI, marked as a development behaviour. |
| A client bundle imports a module that can read a provider key | The build fails: those modules import `server-only`. |
| An unexpected error | The client receives a generic message plus a request id; the detail stays in the server log. Error text that is returned is redacted of keys, bearer tokens, AWS signatures and database URLs with embedded passwords. |

---

## 4. Deploy on Vercel

1. [vercel.com/new](https://vercel.com/new) → import `delter-technologies/delter-ai`.
2. Framework preset **Next.js** is detected. Build `npm run build`, output `.next` —
   leave both at their defaults. The build script runs `prisma generate` first, and
   `postinstall` runs it too, so the git-ignored client is produced on the host
   either way. `DATABASE_URL` and `SESSION_SECRET` must be present at build time.
3. Add every variable from section 3 (Environment Variables → add, apply to
   Production and Preview as appropriate).
4. Deploy.
5. Create the schema against the production database once, from a machine with the
   production `DATABASE_URL`:
   ```bash
   DATABASE_URL="postgresql://…" npx prisma migrate deploy
   ```
   This applies the committed `prisma/migrations/0_init`. Vercel functions do not run
   migrations for you, and the app does not create tables at request time.
6. Run the checklist in section 6.

**Known Vercel constraints**

- **Function duration.** `src/app/api/ai/stream` declares `maxDuration = 300`. Hobby
  clamps that to 10 s (60 s with Fluid compute), so a long generation can be cut off.
  Pro/Fluid, or a Node host, removes the ceiling.
- **No writable disk.** `STORAGE_DRIVER=local` cannot work here; use `s3`.
- **Node version.** Set the project's Node.js runtime to 22.x (Settings → General).
  The app runs on Node 20, but `@aws-sdk/client-s3` prints a support warning there:
  AWS SDK releases after January 2027 require Node 22 or newer.
- **Prisma engine.** If a deploy logs a query-engine error, add
  `binaryTargets = ["native", "rhel-openssl-3.0.x"]` to the `generator client` block
  in `prisma/schema.prisma` and redeploy.

---

## 5. Alternative: a plain Node host

Any host that runs a long-lived Node process with a persistent volume (Railway,
Fly.io, Render, a VPS) works:

```bash
npm ci                      # postinstall runs prisma generate
npx prisma migrate deploy   # once, with the production DATABASE_URL
npm run build
npm start                   # listens on PORT/3000
```

- `STORAGE_DRIVER=local` keeps uploads on the volume — no object store needed.
- No function timeout, so streaming responses run to completion.
- Postgres is still required (a managed free tier is fine). If you would rather keep
  a single file, change `provider` in `prisma/schema.prisma` back to `"sqlite"`,
  point `DATABASE_URL` at `file:../data/db.sqlite` and run `prisma db push` — nothing
  else in the codebase changes.

---

## 6. Post-deploy checklist

Work through these on the deployed URL; each one exercises a different subsystem.

1. **Sign up** with a real email → onboarding appears once → you land in `/app`.
2. **Settings → Appearance & AI → Providers → Test** each provider. Expect a green
   result only where the account has credit; a refusal should name the provider's
   reason and its billing URL.
3. **Chat**: send a message, confirm the reply streams, the model named in the
   message footer is the one you expect, and no fallback warning appears when you did
   not ask for a specific model.
4. **Files**: upload a text file, download it, check Settings → Usage reports the
   bytes, then delete it and confirm the download 404s with an honest message.
5. **Code Studio**: create a file, ask the assistant to modify it, apply the change,
   open the preview.
6. **Security**: sign out, sign in again, and confirm Settings → Security lists both
   sessions with the right device description; revoke one and confirm it stops
   working.
7. **Isolation**: with a second account, try the first account's project or file id in
   the URL. It must be refused, not rendered.
8. **No secrets in the repo**: `git ls-files | grep -E '^\.env$|/data/'` returns
   nothing.
9. **Guards**: on a preview deployment, unset `STORAGE_DRIVER` and confirm an upload
   fails with an operator-facing error rather than writing to an ephemeral disk;
   unset `RESET_EMAIL_URL` and confirm the forgot-password form says reset is
   unavailable instead of returning a link. Restore both afterwards.
10. **Password reset end to end** (once `RESET_EMAIL_URL` points at a real sender):
    request a reset, follow the emailed link, set a new password, and confirm the
    old password stops working and existing sessions are signed out.

---

## 7. Current limits (unchanged by deploying)

- **Password-reset delivery needs your email provider.** The route is complete and
  verified: with `RESET_EMAIL_URL` set it POSTs `{ to, type, resetPath, product }` to
  that endpoint, returns only a neutral confirmation, and the token is single-use,
  expires in an hour and revokes every session when used. What the repository cannot
  supply is the sender itself — point `RESET_EMAIL_URL` at a Resend/Postmark/SES
  webhook (or any small function that calls one). Until then, production creates no
  token and the UI says password reset is unavailable; in development the link is
  shown in the response so the flow stays testable.
- **Billing is not enabled.** Usage is metered and shown; no plans, no payments, no
  enforced limits. The Settings billing tab says so instead of showing dead controls.
- **No self-service account deletion.** Settings explains what an operator would
  remove (rows for the account id plus stored objects).
- **Roadmap tools** — Image Studio, Website Builder, Research, Presentations,
  Spreadsheets, Automations, Integrations & API — render an explicit "not built yet"
  state. Nothing fakes a result.
