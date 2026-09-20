"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/States";
import {
  IconArrowRight,
  IconChat,
  IconClock,
  IconCode,
  IconFiles,
  IconFolder,
  IconImage,
  IconPlus,
  IconProjects,
  IconResearch,
  IconSparkle,
  IconUpload,
} from "@/components/ui/Icons";
import { relativeTime } from "@/lib/client/format";

/**
 * Dashboard.
 *
 * Structure, in priority order:
 *   1. an honest status line when no AI provider is configured
 *   2. quick actions — the seven things the brief lists, each wired to a real
 *      destination (image/research actions open the tool's roadmap page rather
 *      than pretending to generate anything)
 *   3. recent projects, conversations and files
 *   4. real usage from the last 30 days
 *
 * First run replaces the empty lists with a short "start here" path instead of
 * showing three empty states at once.
 */

export type DashboardProject = {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  lastOpenedAt: string | null;
  counts: { codeFiles: number; conversations: number; files: number };
};

export type DashboardConversation = {
  id: string;
  title: string;
  kind: string;
  projectName: string | null;
  model: string | null;
  lastMessageAt: string;
  messageCount: number;
};

export type DashboardFile = {
  id: string;
  name: string;
  sizeLabel: string;
  mimeType: string;
  extractable: boolean;
  createdAt: string;
};

export function DashboardView({
  greeting,
  displayName,
  firstRun,
  demoMode,
  unconfiguredProviders,
  projects,
  conversations,
  files,
  usage,
}: {
  greeting: string;
  displayName: string;
  firstRun: boolean;
  demoMode: boolean;
  unconfiguredProviders: { id: string; label: string; reason: string | null }[];
  projects: DashboardProject[];
  conversations: DashboardConversation[];
  files: DashboardFile[];
  usage: {
    requests: number;
    failedRequests: number;
    totalTokens: number;
    uploads: number;
    codeFiles: number;
    byDay: { date: string; requests: number; totalTokens: number }[];
  };
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);

  const quickActions = useMemo(
    () => [
      { id: "chat", label: "New chat", icon: <IconChat size={16} />, onClick: () => router.push("/app/chat?new=1") },
      { id: "project", label: "New project", icon: <IconProjects size={16} />, href: "/app/projects?new=1" },
      { id: "upload", label: "Upload file", icon: <IconUpload size={16} />, onClick: () => router.push("/app/files?upload=1") },
      { id: "code", label: "Open Code Studio", icon: <IconCode size={16} />, href: "/app/code" },
      { id: "image", label: "Create image", icon: <IconImage size={16} />, href: "/app/image-studio", soon: true, stage: 7 },
      { id: "website", label: "Build website", icon: <IconSparkle size={16} />, href: "/app/website-builder", soon: true, stage: 8 },
      { id: "research", label: "Research", icon: <IconResearch size={16} />, href: "/app/research", soon: true, stage: 9 },
    ],
    [router],
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-5 sm:py-7">
      {/* ---------------------------------------------------------- header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[21px] font-semibold tracking-[-0.025em] text-fg sm:text-[24px]">
            {greeting}, {displayName}
          </h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            {firstRun
              ? "Your workspace is empty. Start with a chat or a project."
              : `${projects.length} project${projects.length === 1 ? "" : "s"} · ${conversations.length} recent conversation${conversations.length === 1 ? "" : "s"} · ${usage.codeFiles} code file${usage.codeFiles === 1 ? "" : "s"}`}
          </p>
        </div>
        <Link
          href="/app/chat?new=1"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--accent)" }}
        >
          <IconPlus size={14} />
          New chat
        </Link>
      </div>

      {/* ------------------------------------------------- provider status */}
      {demoMode ? (
        <div
          className="mt-5 flex flex-col gap-3 rounded-lg border p-3.5 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: "color-mix(in srgb, var(--warning) 35%, var(--border))", background: "var(--warning-soft)" }}
        >
          <div className="min-w-0">
            <p className="text-[13px] font-semibold" style={{ color: "var(--warning)" }}>
              Offline demo mode — no AI provider is configured
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-fg-secondary">
              Responses come from Delter AI's local demo provider, which says so in every reply. Streaming, persistence,
              projects, files and Code Studio all work fully, but no real model is being called.
              {unconfiguredProviders.length ? (
                <>
                  {" "}
                  Add a key to{" "}
                  <span className="font-mono text-[11.5px]">
                    {unconfiguredProviders.map((provider) => `${provider.id.toUpperCase().replace("-", "")}_API_KEY`).join(" or ")}
                  </span>{" "}
                  in the server <span className="font-mono text-[11.5px]">.env</span> file to go live.
                </>
              ) : null}
            </p>
          </div>
          <Link
            href="/app/settings?tab=ai"
            className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border bg-surface px-3 text-[12.5px] font-medium text-fg transition-colors hover:bg-bg-muted"
            style={{ borderColor: "var(--border)" }}
          >
            Provider status
            <IconArrowRight size={13} />
          </Link>
        </div>
      ) : null}

      {/* ---------------------------------------------------- quick actions */}
      <section className="mt-6" aria-labelledby="quick-actions">
        <h2 id="quick-actions" className="label-caps mb-2.5">
          Quick actions
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {quickActions.map((action) => {
            const content = (
              <>
                <span className="shrink-0 text-fg-muted" aria-hidden>
                  {action.icon}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">{action.label}</span>
                {action.soon ? (
                  <span
                    className="shrink-0 rounded border px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-fg-faint"
                    style={{ borderColor: "var(--border)" }}
                  >
                    Step {action.stage}
                  </span>
                ) : null}
              </>
            );

            const className =
              "flex h-[38px] items-center gap-2 rounded-lg border bg-surface px-2.5 text-left transition-colors hover:bg-bg-muted";

            if (action.href) {
              return (
                <Link
                  key={action.id}
                  href={action.href}
                  className={className}
                  style={{ borderColor: "var(--border)" }}
                  title={action.soon ? `${action.label} — not built yet (roadmap step ${action.stage})` : action.label}
                >
                  {content}
                </Link>
              );
            }

            return (
              <button
                key={action.id}
                type="button"
                onClick={action.onClick}
                disabled={uploading}
                className={className}
                style={{ borderColor: "var(--border)", opacity: uploading ? 0.6 : 1 }}
              >
                {content}
              </button>
            );
          })}
        </div>
      </section>

      {/* --------------------------------------------------------- content */}
      {firstRun ? (
        <FirstRun />
      ) : (
        <div className="mt-7 grid gap-5 lg:grid-cols-3">
          <Section
            title="Recent projects"
            href="/app/projects"
            hrefLabel="All projects"
            className="lg:col-span-1"
            empty={
              <EmptyState
                compact
                icon={<IconFolder size={18} />}
                title="No projects yet"
                description="A project holds conversations, files and code together."
                action={
                  <Link
                    href="/app/projects?new=1"
                    className="inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-semibold text-white"
                    style={{ background: "var(--accent)" }}
                  >
                    Create a project
                  </Link>
                }
              />
            }
          >
            <ul className="space-y-1.5">
              {projects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/app/projects/${project.id}`}
                    className="flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors hover:bg-bg-muted"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span className="mt-0.5 shrink-0 text-fg-muted" aria-hidden>
                      <IconFolder size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-fg">{project.name}</span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-fg-muted">
                        {[
                          project.counts.codeFiles ? `${project.counts.codeFiles} code file${project.counts.codeFiles === 1 ? "" : "s"}` : null,
                          project.counts.conversations ? `${project.counts.conversations} chat${project.counts.conversations === 1 ? "" : "s"}` : null,
                          project.counts.files ? `${project.counts.files} file${project.counts.files === 1 ? "" : "s"}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || project.kind}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-fg-faint">
                      {project.lastOpenedAt ? relativeTime(project.lastOpenedAt) : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            title="Recent conversations"
            href="/app/chat"
            hrefLabel="Open chat"
            className="lg:col-span-1"
            empty={
              <EmptyState
                compact
                icon={<IconChat size={18} />}
                title="No conversations yet"
                description="Chats persist across sessions and can carry project context."
                action={
                  <Link
                    href="/app/chat?new=1"
                    className="inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-semibold text-white"
                    style={{ background: "var(--accent)" }}
                  >
                    Start a chat
                  </Link>
                }
              />
            }
          >
            <ul className="space-y-1.5">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <Link
                    href={conversation.kind === "code" ? "/app/code" : `/app/chat/${conversation.id}`}
                    className="flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors hover:bg-bg-muted"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span className="mt-0.5 shrink-0 text-fg-muted" aria-hidden>
                      {conversation.kind === "code" ? <IconCode size={15} /> : <IconChat size={15} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-fg">{conversation.title}</span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-fg-muted">
                        {conversation.projectName ? `${conversation.projectName} · ` : ""}
                        {conversation.messageCount} message{conversation.messageCount === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-fg-faint">{relativeTime(conversation.lastMessageAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            title="Recent files"
            href="/app/files"
            hrefLabel="All files"
            className="lg:col-span-1"
            empty={
              <EmptyState
                compact
                icon={<IconFiles size={18} />}
                title="No files yet"
                description="Upload documents and attach them to a conversation as context."
                action={
                  <Link
                    href="/app/files?upload=1"
                    className="inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-semibold text-white"
                    style={{ background: "var(--accent)" }}
                  >
                    Upload a file
                  </Link>
                }
              />
            }
          >
            <ul className="space-y-1.5">
              {files.map((file) => (
                <li key={file.id}>
                  <Link
                    href={`/app/files?file=${file.id}`}
                    className="flex items-center gap-2.5 rounded-lg border p-2.5 transition-colors hover:bg-bg-muted"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span className="shrink-0 text-fg-muted" aria-hidden>
                      <IconFiles size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-fg">{file.name}</span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-fg-muted">
                        {file.sizeLabel}
                        {file.extractable ? " · readable as AI context" : " · not readable as text"}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-fg-faint">{relativeTime(file.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>

          <UsagePanel usage={usage} className="lg:col-span-3" />
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  href,
  hrefLabel,
  children,
  empty,
  className = "",
}: {
  title: string;
  href: string;
  hrefLabel: string;
  children: React.ReactNode;
  empty: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className} aria-labelledby={`section-${title.replace(/\s+/g, "-").toLowerCase()}`}>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 id={`section-${title.replace(/\s+/g, "-").toLowerCase()}`} className="label-caps">
          {title}
        </h2>
        <Link href={href} className="shrink-0 text-[12px] font-medium text-accent-text hover:underline">
          {hrefLabel}
        </Link>
      </div>
      {children}
    </section>
  );
}

function FirstRun() {
  const steps = [
    {
      title: "Start a conversation",
      body: "Ask Delter AI anything. Your chats are saved to your account and survive a refresh.",
      href: "/app/chat?new=1",
      cta: "Open chat",
    },
    {
      title: "Create a project",
      body: "Projects hold conversations, uploaded files and code together, so the assistant keeps the right context.",
      href: "/app/projects?new=1",
      cta: "New project",
    },
    {
      title: "Try Code Studio",
      body: "Start from the static-website template and you will have a working editor, file tree and preview immediately.",
      href: "/app/code",
      cta: "Open Code Studio",
    },
  ];

  return (
    <section className="mt-7" aria-labelledby="getting-started">
      <h2 id="getting-started" className="label-caps mb-2.5">
        Getting started
      </h2>
      <div className="grid gap-2.5 sm:grid-cols-3">
        {steps.map((step, index) => (
          <Link
            key={step.title}
            href={step.href}
            className="flex flex-col rounded-lg border bg-surface p-4 transition-colors hover:bg-bg-muted"
            style={{ borderColor: "var(--border)" }}
          >
            <span className="font-mono text-[11px] text-fg-faint">{String(index + 1).padStart(2, "0")}</span>
            <span className="mt-1.5 text-[14px] font-semibold text-fg">{step.title}</span>
            <span className="mt-1 flex-1 text-[12.5px] leading-relaxed text-fg-muted">{step.body}</span>
            <span className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-accent-text">
              {step.cta}
              <IconArrowRight size={13} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function UsagePanel({
  usage,
  className = "",
}: {
  usage: {
    requests: number;
    failedRequests: number;
    totalTokens: number;
    uploads: number;
    byDay: { date: string; requests: number; totalTokens: number }[];
  };
  className?: string;
}) {
  const hasData = usage.requests > 0 || usage.uploads > 0;
  const peak = Math.max(1, ...usage.byDay.map((day) => day.requests));

  return (
    <section className={className} aria-labelledby="usage-30d">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 id="usage-30d" className="label-caps">
          Usage · last 30 days
        </h2>
        <Link href="/app/settings?tab=usage" className="shrink-0 text-[12px] font-medium text-accent-text hover:underline">
          Details
        </Link>
      </div>

      <div className="rounded-lg border bg-surface p-4" style={{ borderColor: "var(--border)" }}>
        {!hasData ? (
          <p className="flex items-center gap-2 text-[13px] text-fg-muted">
            <IconClock size={15} />
            No metered operations yet. Requests, tokens and storage appear here once you use Delter AI.
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="AI requests" value={usage.requests.toLocaleString()} />
              <Metric
                label="Tokens"
                value={usage.totalTokens >= 1000 ? `${(usage.totalTokens / 1000).toFixed(1)}k` : String(usage.totalTokens)}
              />
              <Metric label="Uploads" value={String(usage.uploads)} />
              <Metric
                label="Failed"
                value={String(usage.failedRequests)}
                tone={usage.failedRequests > 0 ? "warning" : "neutral"}
              />
            </dl>

            {usage.byDay.length ? (
              <div className="mt-4">
                <p className="label-caps mb-2">Requests per day</p>
                <div className="flex h-16 items-end gap-[3px]" role="img" aria-label={`Requests per day: ${usage.byDay.map((day) => `${day.date}: ${day.requests}`).join(", ")}`}>
                  {usage.byDay.map((day) => (
                    <div
                      key={day.date}
                      className="min-w-[3px] flex-1 rounded-t-sm transition-colors"
                      style={{
                        height: `${Math.max(4, (day.requests / peak) * 100)}%`,
                        background: day.requests ? "var(--accent)" : "var(--border)",
                        opacity: day.requests ? 0.85 : 0.5,
                      }}
                      title={`${day.date}: ${day.requests} request${day.requests === 1 ? "" : "s"}`}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <p className="mt-4 text-[11.5px] leading-relaxed text-fg-faint">
              Recorded server-side as operations happen. Billing is roadmap step 21 — nothing is charged and no limits are
              enforced yet.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "warning" }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11.5px] text-fg-muted">{label}</dt>
      <dd
        className="mt-0.5 text-[19px] font-semibold tracking-[-0.02em]"
        style={{ color: tone === "warning" ? "var(--warning)" : "var(--text)" }}
      >
        {value}
      </dd>
    </div>
  );
}
