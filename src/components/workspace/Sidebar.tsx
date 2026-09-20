"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TOOL_ICONS, IconChevronDown, IconClose, IconHome, IconLogo, IconLogout, IconPlus, IconSettings, IconUser } from "@/components/ui/Icons";
import { Menu } from "@/components/ui/Menu";
import { toolsByGroup, type Tool } from "@/lib/tools";
import { useProjects } from "./ProjectProvider";

/**
 * Workspace sidebar.
 *
 * Navigation is grouped (Workspace / Create / Extend) rather than presented as
 * one long list, so the rail stays readable as the roadmap grows. Tools that are
 * not built yet are shown as clearly not available — never as a link that leads
 * somewhere broken.
 *
 * It collapses to an icon rail on the user's request, and becomes a drawer below
 * 1024px so the editor and chat keep their full width on tablets and phones.
 */

export type SidebarUser = {
  id: string;
  email: string;
  name: string | null;
  displayName: string | null;
};

const COLLAPSE_KEY = "delter.sidebarCollapsed";

export function Sidebar({
  user,
  open,
  onClose,
  collapsed,
  onToggleCollapsed,
  onSignOut,
  onNewChat,
}: {
  user: SidebarUser;
  /** Drawer state, only meaningful below lg. */
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSignOut: () => void;
  onNewChat: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { projects, activeProjectId, setActiveProjectId } = useProjects();

  // Close the drawer whenever navigation happens on a small screen.
  useEffect(() => {
    if (open) onClose();
    // Only react to the route changing, not to `open` toggling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const groups = toolsByGroup();
  const initials = getInitials(user.displayName || user.name || user.email);

  return (
    <>
      {/* Drawer backdrop on small screens */}
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      ) : null}

      <aside
        className={[
          "z-50 flex h-dvh shrink-0 flex-col border-r bg-bg-subtle transition-[width,transform] duration-150",
          "fixed inset-y-0 left-0 lg:static lg:translate-x-0",
          collapsed ? "w-[60px]" : "w-[244px]",
          open ? "translate-x-0 shadow-lg" : "-translate-x-full",
        ].join(" ")}
        style={{ borderColor: "var(--border)" }}
        aria-label="Delter AI navigation"
      >
        {/* ------------------------------------------------------------ */}
        <div className={`flex h-12 shrink-0 items-center border-b ${collapsed ? "justify-center px-2" : "justify-between px-3"}`} style={{ borderColor: "var(--border)" }}>
          <Link
            href="/app"
            className={`flex min-w-0 items-center gap-2 text-fg ${collapsed ? "" : ""}`}
            title="Delter AI — dashboard"
          >
            <span className="shrink-0" style={{ color: "var(--accent)" }}>
              <IconLogo size={collapsed ? 20 : 22} />
            </span>
            {!collapsed ? (
              <span className="truncate text-[14px] font-semibold tracking-[-0.02em]">Delter AI</span>
            ) : null}
          </Link>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="-mr-1 flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg lg:hidden"
          >
            <IconClose size={15} />
          </button>
        </div>

        {/* ------------------------------------------------ project context */}
        {!collapsed ? (
          <div className="shrink-0 border-b px-2.5 py-2.5" style={{ borderColor: "var(--border)" }}>
            <ProjectSwitcher
              projects={projects}
              activeProjectId={activeProjectId}
              onSelect={setActiveProjectId}
            />
          </div>
        ) : null}

        {/* ------------------------------------------------------ navigation */}
        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-2.5">
          <NavItem
            href="/app"
            label="Dashboard"
            icon={<IconHome size={16} />}
            active={pathname === "/app"}
            collapsed={collapsed}
          />

          {groups.map((group) => (
            <div key={group.id} className="mt-3.5 first:mt-0">
              {!collapsed ? (
                <p className="label-caps px-2 pb-1.5">{group.label}</p>
              ) : (
                <div className="mx-2 mb-1.5 h-px" style={{ background: "var(--border)" }} aria-hidden />
              )}
              <ul className="space-y-px">
                {group.tools.map((tool) => (
                  <li key={tool.id}>
                    <ToolNavItem tool={tool} pathname={pathname} collapsed={collapsed} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* ---------------------------------------------------------- footer */}
        <div className="shrink-0 border-t p-2" style={{ borderColor: "var(--border)" }}>
          {!collapsed ? (
            <button
              type="button"
              onClick={onNewChat}
              className="mb-1.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border text-[12.5px] font-medium text-fg-secondary transition-colors hover:bg-bg-muted hover:text-fg"
              style={{ borderColor: "var(--border)" }}
            >
              <IconPlus size={14} />
              New chat
            </button>
          ) : null}

          <div className={`flex items-center ${collapsed ? "flex-col gap-1.5" : "gap-1.5"}`}>
            {!collapsed ? (
              <Menu
                width={240}
                ariaLabel="Account"
                items={[
                  {
                    key: "settings",
                    label: "Settings",
                    icon: <IconSettings size={14} />,
                    onSelect: () => router.push("/app/settings"),
                  },
                  {
                    key: "signout",
                    label: "Sign out",
                    icon: <IconLogout size={14} />,
                    tone: "danger",
                    onSelect: onSignOut,
                  },
                ]}
                trigger={({ toggle, ref }) => (
                  <button
                    ref={ref}
                    type="button"
                    onClick={toggle}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-bg-muted"
                  >
                    <Avatar initials={initials} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium text-fg">
                        {user.displayName || user.name || "Account"}
                      </span>
                      <span className="block truncate text-[11px] text-fg-muted">{user.email}</span>
                    </span>
                    <IconChevronDown size={13} className="shrink-0 text-fg-faint" />
                  </button>
                )}
              />
            ) : (
              <button
                type="button"
                onClick={() => router.push("/app/settings")}
                title="Settings"
                aria-label="Settings"
                className="flex h-8 w-8 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
              >
                <IconSettings size={16} />
              </button>
            )}

            <button
              type="button"
              onClick={onToggleCollapsed}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg lg:flex"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {collapsed ? <path d="m6 3.5 4.5 4.5L6 12.5" /> : <path d="M10 3.5 5.5 8l4.5 4.5" />}
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold"
      style={{ background: "var(--accent-soft)", color: "var(--accent-text)" }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

function getInitials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function NavItem({
  href,
  label,
  icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={[
        "group flex h-8 items-center rounded-md text-[13px] transition-colors",
        collapsed ? "justify-center px-0" : "gap-2.5 px-2",
        active ? "font-medium" : "font-normal text-fg-secondary hover:bg-bg-muted hover:text-fg",
      ].join(" ")}
      style={
        active
          ? { background: "var(--accent-soft)", color: "var(--accent-text)" }
          : undefined
      }
    >
      <span className="shrink-0" aria-hidden>
        {icon}
      </span>
      {!collapsed ? <span className="truncate">{label}</span> : null}
    </Link>
  );
}

function ToolNavItem({ tool, pathname, collapsed }: { tool: Tool; pathname: string; collapsed: boolean }) {
  const Icon = TOOL_ICONS[tool.id];
  const active = Boolean(tool.href && (pathname === tool.href || pathname.startsWith(`${tool.href}/`)));

  if (!tool.available || !tool.href) {
    // Not built yet. It links to a page that says so plainly — the roadmap step,
    // what is planned, and what Delter AI can do today instead. It is styled as
    // unavailable and never presented as a working feature.
    return (
      <Link
        href={`/app/${tool.id}`}
        className={`flex h-8 items-center rounded-md text-[13px] hover:bg-bg-subtle ${
          collapsed ? "justify-center" : "gap-2.5 px-2"
        }`}
        title={`${tool.label} — not built yet (roadmap step ${tool.stage}). Opens the roadmap page.`}
        aria-label={`${tool.label} — not built yet, roadmap step ${tool.stage}`}
      >
        <span className="shrink-0 text-fg-faint" aria-hidden>
          {Icon ? <Icon size={16} /> : null}
        </span>
        {!collapsed ? (
          <>
            <span className="min-w-0 flex-1 truncate text-fg-faint">{tool.label}</span>
            <span className="shrink-0 rounded border px-1 py-px text-[9.5px] font-semibold uppercase leading-[13px] tracking-wide text-fg-faint" style={{ borderColor: "var(--border)" }}>
              Step {tool.stage}
            </span>
          </>
        ) : null}
      </Link>
    );
  }

  return (
    <Link
      href={tool.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? tool.label : undefined}
      className={[
        "flex h-8 items-center rounded-md text-[13px] transition-colors",
        collapsed ? "justify-center px-0" : "gap-2.5 px-2",
        active ? "font-medium" : "text-fg-secondary hover:bg-bg-muted hover:text-fg",
      ].join(" ")}
      style={active ? { background: "var(--accent-soft)", color: "var(--accent-text)" } : undefined}
    >
      <span className="shrink-0" aria-hidden>
        {Icon ? <Icon size={16} /> : null}
      </span>
      {!collapsed ? <span className="truncate">{tool.label}</span> : null}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Project switcher                                                            */
/* -------------------------------------------------------------------------- */

function ProjectSwitcher({
  projects,
  activeProjectId,
  onSelect,
}: {
  projects: { id: string; name: string; kind: string }[];
  activeProjectId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = projects.find((project) => project.id === activeProjectId) ?? null;

  return (
    <div>
      <p className="label-caps mb-1.5 px-0.5">Workspace context</p>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="flex h-9 w-full items-center gap-2 rounded-md border bg-surface px-2.5 text-left transition-colors hover:bg-bg-muted"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium text-fg">
              {active ? active.name : "No project"}
            </span>
            <span className="block truncate text-[11px] text-fg-muted">
              {active ? `${active.kind} · AI uses this project's context` : "Chat and tools work without project context"}
            </span>
          </span>
          <IconChevronDown size={13} className={`shrink-0 text-fg-faint transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open ? (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
            <div
              role="listbox"
              aria-label="Choose the active project"
              className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-72 overflow-y-auto rounded-lg border bg-surface-raised py-1 shadow-lg"
              style={{ borderColor: "var(--border)" }}
            >
              <button
                type="button"
                role="option"
                aria-selected={!activeProjectId}
                onClick={() => {
                  onSelect(null);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] transition-colors hover:bg-bg-muted"
                style={{ color: !activeProjectId ? "var(--accent-text)" : "var(--text)" }}
              >
                <span className="min-w-0 flex-1">No project</span>
                {!activeProjectId ? <CheckMark /> : null}
              </button>

              {projects.length ? (
                <div className="my-1 h-px" style={{ background: "var(--border)" }} aria-hidden />
              ) : null}

              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  role="option"
                  aria-selected={project.id === activeProjectId}
                  onClick={() => {
                    onSelect(project.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] transition-colors hover:bg-bg-muted"
                  style={{ color: project.id === activeProjectId ? "var(--accent-text)" : "var(--text)" }}
                >
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  <span className="shrink-0 text-[10.5px] text-fg-faint">{project.kind}</span>
                  {project.id === activeProjectId ? <CheckMark /> : null}
                </button>
              ))}

              <div className="my-1 h-px" style={{ background: "var(--border)" }} aria-hidden />
              <Link
                href="/app/projects"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] font-medium text-fg-secondary transition-colors hover:bg-bg-muted hover:text-fg"
              >
                <IconPlus size={13} />
                Manage projects
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function CheckMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
      <path d="M13 4.75 6.25 11.5 3 8.25" />
    </svg>
  );
}

export { COLLAPSE_KEY };
