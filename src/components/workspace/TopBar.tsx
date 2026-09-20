"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IconMenu, IconMoon, IconSun } from "@/components/ui/Icons";
import { Badge } from "@/components/ui/States";
import { useTheme } from "@/components/system/ThemeProvider";
import { useProjects } from "./ProjectProvider";
import { TOOLS } from "@/lib/tools";

/**
 * Top bar.
 *
 * Deliberately thin (48px) and quiet: it carries the drawer handle on small
 * screens, where you are in the product, the active project, the demo-mode
 * indicator and the theme control. Nothing else — screens provide their own
 * toolbars.
 */
export function TopBar({
  onOpenDrawer,
  demoMode,
  signingOut,
}: {
  onOpenDrawer: () => void;
  demoMode: boolean;
  signingOut: boolean;
}) {
  const pathname = usePathname();
  const { resolved, toggle } = useTheme();
  const { activeProject } = useProjects();

  // Derived after mount so server and client first paint agree.
  const [section, setSection] = useState<string>("");
  useEffect(() => {
    setSection(sectionForPath(pathname));
  }, [pathname]);

  return (
    <header
      className="flex h-12 shrink-0 items-center gap-2 border-b bg-bg px-2 sm:px-3"
      style={{ borderColor: "var(--border)" }}
    >
      <button
        type="button"
        onClick={onOpenDrawer}
        aria-label="Open navigation"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-bg-muted hover:text-fg lg:hidden"
      >
        <IconMenu size={17} />
      </button>

      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
        <Link href="/app" className="shrink-0 text-[12.5px] text-fg-muted transition-colors hover:text-fg">
          Workspace
        </Link>
        {section ? (
          <>
            <span className="shrink-0 text-fg-faint" aria-hidden>
              /
            </span>
            <span className="truncate text-[12.5px] font-medium text-fg">{section}</span>
          </>
        ) : null}
      </nav>

      {activeProject ? (
        <span className="hidden min-w-0 items-center gap-1.5 rounded-full border px-2 py-[1px] sm:flex" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} aria-hidden />
          <span className="max-w-[16ch] truncate text-[11.5px] text-fg-secondary">{activeProject.name}</span>
        </span>
      ) : null}

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {demoMode ? (
          <Badge tone="warning" title="No AI provider key is configured on this server, so responses come from the offline demo provider.">
            Demo mode
          </Badge>
        ) : null}

        {signingOut ? <span className="text-[11.5px] text-fg-muted">Signing out…</span> : null}

        <button
          type="button"
          onClick={toggle}
          aria-label={`Switch to ${resolved === "dark" ? "light" : "dark"} theme`}
          title={`Switch to ${resolved === "dark" ? "light" : "dark"} theme`}
          className="flex h-8 w-8 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-bg-muted hover:text-fg"
        >
          {resolved === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
        </button>
      </div>
    </header>
  );
}

/** Path → the label shown in the breadcrumb. Falls back to the tool registry. */
function sectionForPath(pathname: string): string {
  if (!pathname || pathname === "/app" || pathname === "/app/") return "";

  const segments = pathname.split("/").filter(Boolean); // ["app", "code", "p1"]
  const toolId = segments[1];
  if (!toolId) return "";

  // Code Studio and Projects can carry a nested id; label them by tool, not id.
  const tool = TOOLS.find((candidate) => candidate.href === `/app/${toolId}`);
  if (tool) return tool.label;

  switch (toolId) {
    case "settings":
      return "Settings";
    case "usage":
      return "Usage";
    default:
      return toolId.charAt(0).toUpperCase() + toolId.slice(1);
  }
}
