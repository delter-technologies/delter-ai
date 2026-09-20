import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { TOOLS } from "@/lib/tools";
import { IconArrowRight, IconCheck, IconLogo } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

/**
 * Landing page.
 *
 * A signed-in visitor goes straight into the workspace — they are never shown
 * marketing again. For everyone else this states what Delter AI is, what is
 * working today, and what is still on the roadmap. No invented awards, funding,
 * customers, partnerships, revenue, user counts, certifications or years of
 * operation, because none have been provided.
 */
export default async function LandingPage() {
  const session = await getSession();
  if (session) {
    redirect(session.user.onboardedAt ? "/app" : "/onboarding");
  }

  const available = TOOLS.filter((tool) => tool.available);
  const upcoming = TOOLS.filter((tool) => !tool.available);

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-40 border-b bg-bg/95 backdrop-blur-[2px]" style={{ borderColor: "var(--border)" }}>
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 text-fg" aria-label="Delter AI home">
            <span style={{ color: "var(--accent)" }}>
              <IconLogo size={22} />
            </span>
            <span className="text-[15px] font-semibold tracking-[-0.02em]">Delter AI</span>
          </Link>

          <nav className="flex items-center gap-1.5 sm:gap-2">
            <Link
              href="/signin"
              className="inline-flex h-9 items-center rounded-md px-3 text-[13px] font-medium text-fg-secondary transition-colors hover:bg-bg-muted hover:text-fg"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-9 items-center rounded-md px-3.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "var(--accent)" }}
            >
              Create account
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* ---------------------------------------------------------------- */}
        <section className="mx-auto max-w-6xl px-4 pt-14 pb-16 sm:px-6 sm:pt-20 sm:pb-20">
          <div className="max-w-3xl">
            <p className="label-caps mb-4">A product of Delter Technologies</p>
            <h1 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.035em] text-fg sm:text-[52px]">
              One workspace where the AI knows what you are working on.
            </h1>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-fg-secondary sm:text-[17px]">
              Delter AI puts chat, projects, files and a real code editor in the same place. The assistant carries your
              project context, your files and your conversation history into every answer — so the follow-up{" "}
              <span className="text-fg">“make the header darker”</span> works without you pasting anything back.
            </p>

            <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: "var(--accent)" }}
              >
                Create your account
                <IconArrowRight size={16} />
              </Link>
              <Link
                href="/signin"
                className="inline-flex h-11 items-center justify-center rounded-lg border px-5 text-[14px] font-medium text-fg transition-colors hover:bg-bg-muted"
                style={{ borderColor: "var(--border)" }}
              >
                Sign in
              </Link>
            </div>

            <p className="mt-4 text-[12.5px] text-fg-muted">
              Your data stays in your account. Provider keys are held on the server and never reach the browser.
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section className="border-y" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
            <div className="max-w-2xl">
              <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-fg sm:text-[26px]">
                Working today
              </h2>
              <p className="mt-2 text-[14px] leading-relaxed text-fg-secondary">
                These are the tools you can use right now. Each one is functional and persisted — not a mock-up.
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {available.map((tool) => (
                <div
                  key={tool.id}
                  className="rounded-lg border bg-surface p-4"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex items-center gap-2">
                    <span style={{ color: "var(--success)" }}>
                      <IconCheck size={14} />
                    </span>
                    <h3 className="text-[14px] font-semibold text-fg">{tool.label}</h3>
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-muted">{tool.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-fg sm:text-[26px]">
                Built as one product, not a set of demos
              </h2>
              <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-fg-secondary">
                The same project can hold a conversation, uploaded files, source code and generated output. Switching
                tools does not lose that context.
              </p>

              <ul className="mt-6 space-y-3.5">
                {[
                  {
                    title: "Conversations that persist",
                    body: "History, renaming, deletion, retries and streaming are stored per account and survive a refresh.",
                  },
                  {
                    title: "Provider-agnostic AI",
                    body: "OpenAI, Anthropic and OpenRouter sit behind one abstraction. Switching models does not change a single screen.",
                  },
                  {
                    title: "Files that are really stored",
                    body: "Uploads are written to disk and hashed before a row is created. Delter AI never claims an upload that did not happen.",
                  },
                  {
                    title: "Code Studio with real persistence",
                    body: "A file tree, a syntax-highlighted editor, an assistant that sees your open file, and a browser-sandboxed preview.",
                  },
                  {
                    title: "Isolation by default",
                    body: "Every query is scoped to your user id, and ownership is checked on the server for each request — not just in the router.",
                  },
                ].map((item) => (
                  <li key={item.title} className="flex gap-3">
                    <span
                      className="mt-[3px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{ background: "var(--accent-soft)", color: "var(--accent-text)" }}
                      aria-hidden
                    >
                      <IconCheck size={12} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold text-fg">{item.title}</p>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-fg-muted">{item.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div
              className="h-fit rounded-xl border p-5 sm:p-6"
              style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}
            >
              <p className="label-caps mb-4">Roadmap</p>
              <p className="mb-4 text-[13px] leading-relaxed text-fg-secondary">
                Delter AI is built step by step. Each stage ships only when the previous one is stable — so what is
                listed below is genuinely not built yet, and nothing here pretends otherwise.
              </p>
              <ol className="space-y-2">
                {upcoming.map((tool) => (
                  <li
                    key={tool.id}
                    className="flex items-baseline gap-3 rounded-md border bg-surface px-3 py-2"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span className="shrink-0 font-mono text-[11px] text-fg-faint">
                      {String(tool.stage).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-fg">{tool.label}</span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-fg-muted">{tool.description}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-[12px] leading-relaxed text-fg-faint">
                Usage tracking and billing come after the tools themselves are stable. Entitlement will always be decided
                by the backend, never hardcoded in the client.
              </p>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section className="border-t" style={{ borderColor: "var(--border)" }}>
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
            <div
              className="flex flex-col gap-4 rounded-xl border p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <div className="max-w-lg">
                <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-fg">Start in your workspace</h2>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-secondary">
                  Create an account and you go straight in — no waiting room, no repeated onboarding.
                </p>
              </div>
              <Link
                href="/signup"
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-4.5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: "var(--accent)" }}
              >
                Create account
                <IconArrowRight size={15} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-[12.5px] text-fg-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--text-faint)" }}>
              <IconLogo size={16} />
            </span>
            <span>
              Delter AI — a product of <span className="text-fg-secondary">Delter Technologies</span>
            </span>
          </div>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <Link href="/signin" className="transition-colors hover:text-fg">
              Sign in
            </Link>
            <Link href="/signup" className="transition-colors hover:text-fg">
              Create account
            </Link>
            <Link href="/forgot-password" className="transition-colors hover:text-fg">
              Reset password
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
