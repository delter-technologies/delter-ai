"use client";

import { useMemo, useState } from "react";
import {
  IconChevronDown,
  IconFileCode,
  IconFileText,
  IconFolder,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@/components/ui/Icons";
import { Menu, MenuTriggerButton, type MenuItem } from "@/components/ui/Menu";

/** Mirrors the `files[]` rows returned by GET /api/projects/:id/code-files. */
export type ExplorerFile = {
  id: string;
  path: string;
  name: string;
  language: string;
  languageLabel: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  /** Present when the list was fetched with `?contents=1`, which Code Studio does. */
  content?: string;
};

type TreeNode = {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  file?: ExplorerFile;
};

/**
 * The Code Studio file explorer.
 *
 * Files are stored as flat paths (`src/app/page.tsx`), so the tree is derived
 * here from those paths — there is no folder entity, and folders with a single
 * child collapse into one row so small projects do not look like a maze.
 */

function buildTree(files: ExplorerFile[]): TreeNode {
  const root: TreeNode = { name: "", path: "", children: new Map() };

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let node = root;
    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1;
      const path = parts.slice(0, index + 1).join("/");
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, path, children: new Map() };
        node.children.set(part, child);
      }
      if (isLast) child.file = file;
      node = child;
    });
  }

  return root;
}

/** Collapse single-child folders into `src/app` style rows. */
function flattenSingleChild(node: TreeNode): { label: string; path: string; node: TreeNode } {
  let label = node.name;
  let current = node;
  while (current.children.size === 1 && !current.file) {
    const only = [...current.children.values()][0];
    if (only.file) break;
    label = `${label}/${only.name}`;
    current = only;
  }
  return { label, path: node.path, node: current };
}

function sortNodes(node: TreeNode): TreeNode[] {
  return [...node.children.values()].sort((a, b) => {
    const aDir = a.children.size > 0 && !a.file;
    const bDir = b.children.size > 0 && !b.file;
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function FileExplorer({
  files,
  activeFileId,
  dirtyFileIds,
  onOpen,
  onCreate,
  onRename,
  onDelete,
}: {
  files: ExplorerFile[];
  activeFileId: string | null;
  /** Files with unsaved edits, marked with a dot instead of a fake badge. */
  dirtyFileIds: Set<string>;
  onOpen: (file: ExplorerFile) => void;
  onCreate: () => void;
  onRename: (file: ExplorerFile) => void;
  onDelete: (file: ExplorerFile) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  const tree = useMemo(() => buildTree(files), [files]);

  const matchingIds = useMemo(() => {
    if (!filter.trim()) return null;
    const needle = filter.trim().toLowerCase();
    return new Set(files.filter((file) => file.path.toLowerCase().includes(needle)).map((file) => file.id));
  }, [files, filter]);

  function toggle(path: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function renderNodes(nodes: TreeNode[], depth: number): React.ReactNode {
    const result: React.ReactNode[] = [];

    for (const node of nodes) {
      const isDir = node.children.size > 0 && !node.file;

      if (isDir) {
        const { label, node: collapsedNode } = flattenSingleChild(node);
        const isCollapsed = collapsed.has(label) && !matchingIds;
        const childNodes = sortNodes(collapsedNode);
        // When filtering, skip folders with no matches entirely.
        if (matchingIds && !hasMatch(childNodes, matchingIds)) continue;

        result.push(
          <div key={`dir:${label}`}>
            <button
              type="button"
              onClick={() => toggle(label)}
              className="flex w-full items-center gap-1.5 rounded-[6px] py-1.5 pr-2 text-left hover:bg-bg-subtle"
              style={{ paddingLeft: `${depth * 12 + 6}px` }}
              aria-expanded={!isCollapsed}
            >
              <IconChevronDown
                className={`h-3 w-3 shrink-0 text-fg-faint transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
              />
              <IconFolder className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
              <span className="truncate text-[12.5px] text-fg-secondary">{label}</span>
            </button>
            {!isCollapsed && <div>{renderNodes(childNodes, depth + label.split("/").length)}</div>}
          </div>,
        );
        continue;
      }

      if (node.file) {
        if (matchingIds && !matchingIds.has(node.file.id)) continue;
        const file = node.file;
        const isActive = file.id === activeFileId;
        const isDirty = dirtyFileIds.has(file.id);
        const depthOffset = depth;

        result.push(
          <div
            key={`file:${file.id}`}
            className="group/file relative flex items-center"
            style={{ paddingLeft: `${depthOffset * 12}px` }}
          >
            <button
              type="button"
              onClick={() => onOpen(file)}
              className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-[6px] py-1.5 pl-2 pr-7 text-left transition-colors ${
                isActive ? "bg-bg-muted text-fg" : "text-fg-secondary hover:bg-bg-subtle"
              }`}
              aria-current={isActive ? "true" : undefined}
              title={file.path}
            >
              {file.language === "markdown" || file.language === "text" ? (
                <IconFileText className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
              ) : (
                <IconFileCode className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
              )}
              <span className="truncate text-[12.5px]">{file.name}</span>
              {isDirty && (
                <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-accent" title="Unsaved changes" />
              )}
            </button>

            <div className="absolute right-1 hidden group-hover/file:block focus-within:block">
              <Menu
                items={[
                  {
                    key: "rename",
                    label: "Rename or move…",
                    icon: <IconPencil size={14} />,
                    onSelect: () => onRename(file),
                  },
                  {
                    key: "delete",
                    label: "Delete file",
                    icon: <IconTrash size={14} />,
                    tone: "danger",
                    onSelect: () => onDelete(file),
                  },
                ]}
                align="end"
                ariaLabel={`Actions for ${file.path}`}
                trigger={MenuTriggerButton("File actions")}
              />
            </div>
          </div>,
        );
      }
    }

    return result;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-fg-secondary">Files</p>
          <p className="truncate text-[11px] text-fg-muted">{files.length} stored in the project</p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="shrink-0 rounded-md border border-border p-1.5 text-fg-muted hover:border-border-strong hover:text-fg"
          aria-label="New file"
          title="New file"
        >
          <IconPlus className="h-4 w-4" />
        </button>
      </div>

      {files.length > 8 && (
        <div className="border-b border-border px-3 py-2">
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter files"
            aria-label="Filter files"
            className="w-full rounded-md border border-border bg-bg-subtle px-2 py-1.5 text-[12px] text-fg outline-none focus:border-accent"
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {files.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <p className="text-[12.5px] text-fg-secondary">No files yet</p>
            <p className="mt-1 text-[11.5px] text-fg-muted">
              Create one, or ask the assistant to scaffold the project.
            </p>
          </div>
        ) : (
          renderNodes(sortNodes(tree), 0)
        )}
      </div>
    </div>
  );
}

function hasMatch(nodes: TreeNode[], matchingIds: Set<string>): boolean {
  return nodes.some((node) => {
    if (node.file && matchingIds.has(node.file.id)) return true;
    return hasMatch(sortNodes(node), matchingIds);
  });
}
