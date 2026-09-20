import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { TOOLS } from "@/lib/tools";
import { NotBuiltYet } from "@/components/ui/States";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ tool: string }> };

/**
 * Roadmap tools that are not built yet.
 *
 * `/app/images`, `/app/websites`, … resolve here rather than to a generic 404,
 * so a user who follows a link or types an address gets the truth: the tool is
 * planned, this is the stage that delivers it, and here is what Delter AI can
 * already do instead. Built tools have their own static routes, which Next.js
 * matches ahead of this dynamic segment, so nothing real is intercepted.
 */

const PLANS: Record<string, { capabilities: string[]; alternative: { label: string; href: string; note: string } }> = {
  images: {
    capabilities: [
      "Prompt-based image generation through a provider that supports it",
      "A gallery per project, with the prompt and model stored against each image",
      "Images attachable to conversations as context",
      "Honest failure states when a provider refuses or cannot produce the request",
    ],
    alternative: {
      label: "Open Code Studio",
      href: "/app/code",
      note: "Code Studio can write real SVG and HTML/CSS artwork into a project and preview it.",
    },
  },
  websites: {
    capabilities: [
      "Describe a site, generate the pages, then edit sections conversationally",
      "Reusable sections stored per project rather than regenerated each time",
      "Publishing to a URL with the source kept editable",
    ],
    alternative: {
      label: "Open Code Studio",
      href: "/app/code",
      note: "Code Studio already stores HTML, CSS and JavaScript per project and renders them in a sandboxed preview.",
    },
  },
  research: {
    capabilities: [
      "Structured research runs with sources listed separately from interpretation",
      "Citations kept with the claim they support",
      "Saved briefs that can be reopened and extended",
    ],
    alternative: {
      label: "Open Chat",
      href: "/app/chat",
      note: "Chat can already take your uploaded files as context; a live provider key is needed for real answers.",
    },
  },
  presentations: {
    capabilities: [
      "Generate a slide structure from a brief, then edit slide by slide",
      "Reorder, duplicate and delete slides",
      "Export to a real file format rather than a preview only",
    ],
    alternative: {
      label: "Open Chat",
      href: "/app/chat",
      note: "You can draft an outline in Chat today and keep it inside a project.",
    },
  },
  spreadsheets: {
    capabilities: [
      "Grid editing with formulas evaluated in the app",
      "CSV import and export against your stored files",
      "AI-assisted analysis that shows the calculation, not just an answer",
    ],
    alternative: {
      label: "Open Files",
      href: "/app/files",
      note: "CSV uploads are stored and readable today, and can be attached to a conversation as context.",
    },
  },
  automations: {
    capabilities: [
      "Trigger → condition → action workflows over your projects and files",
      "A run log showing exactly what happened and why it stopped",
      "No hidden scheduling: every run recorded against your account",
    ],
    alternative: {
      label: "Open Projects",
      href: "/app/projects",
      note: "Projects already keep conversations, files and code together, which is what automations will act on.",
    },
  },
  integrations: {
    capabilities: [
      "Connect external services with credentials stored server-side only",
      "A public API for your own scripts, authenticated per account",
      "Per-integration status showing what is connected and what failed",
    ],
    alternative: {
      label: "Open Settings",
      href: "/app/settings",
      note: "AI provider keys are already handled this way: stored in the server environment, never sent to the browser.",
    },
  },
};

export async function generateMetadata({ params }: Props) {
  const { tool } = await params;
  const entry = TOOLS.find((candidate) => candidate.id === tool);
  return { title: entry ? `${entry.label} — not built yet` : "Not found" };
}

export default async function RoadmapToolPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/signin");
  if (!session.user.onboardedAt) redirect("/onboarding");

  const { tool } = await params;
  const entry = TOOLS.find((candidate) => candidate.id === tool);
  if (!entry) notFound();

  // A tool that has since been built should go to its real page, not this one.
  if (entry.available && entry.href) redirect(entry.href);

  const plan = PLANS[entry.id];

  return (
    <div className="h-full overflow-y-auto">
      <NotBuiltYet
        title={entry.label}
        stage={entry.stage}
        description={`${entry.description} This is roadmap step ${entry.stage} for Delter AI. It is not implemented on this server, so there is no screen behind this address yet.`}
        capabilities={plan?.capabilities ?? ["Planned as part of the Delter AI roadmap."]}
        alternative={plan?.alternative}
      />
    </div>
  );
}
