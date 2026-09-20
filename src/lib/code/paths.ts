import path from "node:path";

/**
 * Project-relative path handling for Code Studio.
 *
 * Code file paths come from user input and become part of a uniqueness key, so
 * they are normalised and validated here. A path that escapes the project
 * (`../../etc/passwd`), is absolute, or contains a null byte is rejected rather
 * than silently coerced.
 */

export const MAX_PATH_LENGTH = 240;
export const MAX_DEPTH = 12;
export const MAX_FILES_PER_PROJECT = 400;
export const MAX_FILE_CONTENT_CHARS = 600_000; // ~150k tokens; generous but bounded

/** Windows reserved device names, which break on some filesystems. */
const RESERVED = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
]);

export type PathCheck = { ok: true; value: string } | { ok: false; message: string };

export function validateProjectPath(rawPath: string): PathCheck {
  const input = String(rawPath ?? "").trim();

  if (!input) return { ok: false, message: "Enter a file name, for example `index.html`." };
  if (input.length > MAX_PATH_LENGTH) {
    return { ok: false, message: `That path is too long (max ${MAX_PATH_LENGTH} characters).` };
  }
  if (input.includes("\0")) return { ok: false, message: "File paths cannot contain null bytes." };

  // Normalise Windows separators so the stored form is always POSIX.
  const posixish = input.replace(/\\/g, "/");

  if (path.posix.isAbsolute(posixish) || /^[a-zA-Z]:/.test(posixish)) {
    return { ok: false, message: "Use a project-relative path such as `src/app.ts`, not an absolute path." };
  }

  const segments = posixish.split("/").filter((s) => s.length > 0);
  if (!segments.length) return { ok: false, message: "Enter a file name." };
  if (segments.length > MAX_DEPTH) {
    return { ok: false, message: `That path is nested too deeply (max ${MAX_DEPTH} folders).` };
  }

  for (const segment of segments) {
    if (segment === "." ) continue;
    if (segment === "..") {
      return { ok: false, message: "File paths cannot contain `..`." };
    }
    if (RESERVED.has(segment.toLowerCase())) {
      return { ok: false, message: `“${segment}” is a reserved device name and cannot be used.` };
    }
    if (/[<>:"|?*\u0000-\u001f]/.test(segment)) {
      return { ok: false, message: `File names cannot contain any of these characters: < > : " | ? *` };
    }
    if (segment.length > 120) return { ok: false, message: "Each folder and file name must be 120 characters or fewer." };
  }

  const normalised = path.posix.normalize(posixish).replace(/^\/+/, "");
  if (!normalised || normalised === ".") return { ok: false, message: "Enter a file name." };
  if (normalised.endsWith("/")) return { ok: false, message: "That looks like a folder. Include a file name, e.g. `assets/logo.svg`." };

  return { ok: true, value: normalised };
}

export function parentDir(filePath: string): string {
  const dir = path.posix.dirname(filePath);
  return dir === "." ? "" : dir;
}

export type FileNode = {
  /** Display name (last segment). */
  name: string;
  /** Full project-relative path, or "" for the root. */
  path: string;
  type: "file" | "dir";
  children?: FileNode[];
};

/** Build the explorer tree from a flat list of project-relative paths. */
export function buildFileTree(paths: { path: string }[]): FileNode[] {
  const root: FileNode = { name: "", path: "", type: "dir", children: [] };

  const sorted = [...paths].map((p) => p.path).sort((a, b) => a.localeCompare(b));

  for (const filePath of sorted) {
    const segments = filePath.split("/");
    let current = root;
    segments.forEach((segment, index) => {
      const isLeaf = index === segments.length - 1;
      const segmentPath = segments.slice(0, index + 1).join("/");
      current.children ??= [];
      let next = current.children.find((child) => child.path === segmentPath);
      if (!next) {
        next = { name: segment, path: segmentPath, type: isLeaf ? "file" : "dir", children: isLeaf ? undefined : [] };
        current.children.push(next);
      }
      current = next;
    });
  }

  sortTree(root.children ?? []);
  return root.children ?? [];
}

/** Folders first, then files, both alphabetical — the convention every IDE uses. */
function sortTree(nodes: FileNode[]) {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
  for (const node of nodes) if (node.children) sortTree(node.children);
}

export function commonDir(paths: string[]): string {
  if (!paths.length) return "";
  const parts = paths.map((p) => p.split("/"));
  const first = parts[0];
  let i = 0;
  for (; i < first.length - 1; i++) {
    if (!parts.every((p) => p[i] === first[i])) break;
  }
  return first.slice(0, i).join("/");
}
