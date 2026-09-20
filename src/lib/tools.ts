/**
 * Delter AI tool registry.
 *
 * One place decides which tools exist. The sidebar, the dashboard quick actions
 * and the router all read from here, so a tool that is not built yet can never
 * appear anywhere as a working button — it is shown as *not available*, with the
 * roadmap stage that will deliver it.
 *
 * This module has no server-only imports so client components can use it.
 */

export type ToolId =
  | "chat"
  | "projects"
  | "files"
  | "code"
  | "images"
  | "websites"
  | "research"
  | "presentations"
  | "spreadsheets"
  | "automations"
  | "integrations";

export type Tool = {
  id: ToolId;
  label: string;
  /** Where it lives in the workspace, when it exists. */
  href: string | null;
  /** Short, factual description — no marketing language. */
  description: string;
  available: boolean;
  /** Matches the build-plan numbering in the roadmap. */
  stage: number;
  /** Sidebar grouping. */
  group: "workspace" | "create" | "extend";
};

export const TOOLS: Tool[] = [
  {
    id: "chat",
    label: "Chat",
    href: "/app/chat",
    description: "Conversations with context from your projects and files.",
    available: true,
    stage: 5,
    group: "workspace",
  },
  {
    id: "projects",
    label: "Projects",
    href: "/app/projects",
    description: "Persistent workspaces holding conversations, files and code.",
    available: true,
    stage: 5,
    group: "workspace",
  },
  {
    id: "files",
    label: "Files",
    href: "/app/files",
    description: "Upload, organise and attach documents as AI context.",
    available: true,
    stage: 5,
    group: "workspace",
  },
  {
    id: "code",
    label: "Code Studio",
    href: "/app/code",
    description: "A real editor with a file tree, AI assistant, preview and saved files.",
    available: true,
    stage: 6,
    group: "create",
  },
  {
    id: "images",
    label: "Image Studio",
    href: null,
    description: "Prompt-based image generation, gallery and project assets.",
    available: false,
    stage: 7,
    group: "create",
  },
  {
    id: "websites",
    label: "Website Builder",
    href: null,
    description: "Describe a site, generate it, edit sections conversationally.",
    available: false,
    stage: 8,
    group: "create",
  },
  {
    id: "research",
    label: "Research",
    href: null,
    description: "Structured research with sources kept separate from interpretation.",
    available: false,
    stage: 9,
    group: "create",
  },
  {
    id: "presentations",
    label: "Presentations",
    href: null,
    description: "Generate slide structures, edit content, reorder, export.",
    available: false,
    stage: 10,
    group: "create",
  },
  {
    id: "spreadsheets",
    label: "Spreadsheets",
    href: null,
    description: "Tables, CSV import/export, formulas and AI-assisted analysis.",
    available: false,
    stage: 11,
    group: "create",
  },
  {
    id: "automations",
    label: "Automations",
    href: null,
    description: "Trigger → action workflows with conditions.",
    available: false,
    stage: 12,
    group: "extend",
  },
  {
    id: "integrations",
    label: "Integrations & API",
    href: null,
    description: "Connect external services with server-side credential storage.",
    available: false,
    stage: 13,
    group: "extend",
  },
];

export const TOOL_GROUPS = [
  { id: "workspace", label: "Workspace" },
  { id: "create", label: "Create" },
  { id: "extend", label: "Extend" },
] as const;

export function toolsByGroup(): { id: string; label: string; tools: Tool[] }[] {
  return TOOL_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    tools: TOOLS.filter((tool) => tool.group === group.id),
  }));
}

export function availableTools(): Tool[] {
  return TOOLS.filter((tool) => tool.available);
}

export function getTool(id: string): Tool | undefined {
  return TOOLS.find((tool) => tool.id === id);
}
