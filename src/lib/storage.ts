import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";

/**
 * File storage.
 *
 * Three things are deliberately kept apart, per the data model:
 *   - metadata   → FileAsset row (name, mime, size, project, hash)
 *   - contents   → bytes on disk under `data/storage/<userId>/<id>`
 *   - storage    → the path recorded on the metadata row
 *
 * Nothing is written to a path derived from user input: the filename is
 * sanitised for display only, and the on-disk name is a server-generated id.
 * A row is never created unless the bytes are already on disk, so Delter AI
 * never claims an upload succeeded when it did not.
 */

export const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".jsonl", ".ndjson",
  ".xml", ".yaml", ".yml", ".toml", ".ini", ".env", ".log", ".sql",
  ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".py", ".rb", ".go", ".rs",
  ".java", ".kt", ".c", ".h", ".cpp", ".hpp", ".cs", ".php", ".swift",
  ".html", ".htm", ".css", ".scss", ".sass", ".less", ".sh", ".bash", ".zsh",
  ".vue", ".svelte", ".astro", ".prisma", ".gitignore", ".dockerfile",
]);

export const MAX_TEXT_EXTRACT_BYTES = 512 * 1024;

/**
 * Blocked outright: anything that would be dangerous or useless to store in a
 * productivity workspace. This is a deny-list on top of a size cap — uploads are
 * never executed, only stored, previewed and read as text.
 */
const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".dll", ".so", ".dylib", ".bat", ".cmd", ".com", ".scr", ".msi",
  ".app", ".deb", ".rpm", ".apk", ".jar", ".vbs", ".jsb", ".ps1", ".psm1",
]);

export type SanitisedName = {
  /** Safe display name. */
  name: string;
  ext: string;
  blocked: boolean;
  reason?: string;
};

export function sanitiseFileName(rawName: string): SanitisedName {
  // Strip any directory component an attacker might smuggle in ("..\\..\\x").
  const base = path.basename(String(rawName ?? "").replace(/\\/g, "/")).trim();
  const withoutControl = base.replace(/[\u0000-\u001f\u007f]/g, "");
  const collapsed = withoutControl.replace(/\s+/g, " ");
  const name = collapsed.length > 180 ? collapsed.slice(0, 180) : collapsed;
  const finalName = name && name !== "." && name !== ".." ? name : "untitled";
  const ext = path.extname(finalName).toLowerCase();
  const blocked = BLOCKED_EXTENSIONS.has(ext);
  return {
    name: finalName,
    ext,
    blocked,
    reason: blocked ? `Files of type ${ext || "this"} cannot be uploaded to Delter AI.` : undefined,
  };
}

export function isTextFile(name: string, mimeType: string | null): boolean {
  const ext = path.extname(name).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (mimeType?.startsWith("text/")) return true;
  if (mimeType === "application/json" || mimeType === "application/xml") return true;
  if (mimeType?.endsWith("+json") || mimeType?.endsWith("+xml")) return true;
  return false;
}

/** Relative storage path for a user's file. */
export function storagePathFor(userId: string, fileId: string, ext: string): string {
  const safeExt = /^\.[a-z0-9]{1,10}$/i.test(ext) ? ext.toLowerCase() : "";
  return path.posix.join(userId, `${fileId}${safeExt}`);
}

export function absoluteStoragePath(relativePath: string): string {
  // Resolve then verify containment: belt and braces against path traversal.
  const root = path.resolve(config.storageRoot);
  const abs = path.resolve(root, relativePath);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error("Refusing to resolve a storage path outside the storage root.");
  }
  return abs;
}

export type StoredFile = {
  storagePath: string;
  size: number;
  sha256: string;
  textContent: string | null;
  extractable: boolean;
  truncatedText: boolean;
};

/** Persist bytes to disk. Throws if the write fails — the caller must not create a row. */
export async function storeFile(
  userId: string,
  fileId: string,
  bytes: Buffer,
  opts: { name: string; ext: string; mimeType: string | null },
): Promise<StoredFile> {
  const relativePath = storagePathFor(userId, fileId, opts.ext);
  const abs = absoluteStoragePath(relativePath);

  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, bytes);

  // Confirm the bytes really landed before anything claims success.
  const info = await stat(abs);

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const extractable = isTextFile(opts.name, opts.mimeType);

  let textContent: string | null = null;
  let truncatedText = false;
  if (extractable) {
    const slice = bytes.subarray(0, MAX_TEXT_EXTRACT_BYTES);
    // Reject binary-looking payloads mislabelled as text.
    if (!containsNullBytes(slice)) {
      textContent = slice.toString("utf8");
      truncatedText = bytes.length > MAX_TEXT_EXTRACT_BYTES;
      if (truncatedText) {
        textContent += `\n\n… [Delter AI stored ${bytes.length.toLocaleString()} bytes; only the first ${MAX_TEXT_EXTRACT_BYTES.toLocaleString()} are indexed as text.]`;
      }
    } else {
      textContent = null;
    }
  }

  return {
    storagePath: relativePath,
    size: info.size,
    sha256,
    textContent,
    extractable: textContent !== null,
    truncatedText,
  };
}

function containsNullBytes(buf: Buffer): boolean {
  const sample = buf.subarray(0, 8_000);
  for (let i = 0; i < sample.length; i++) if (sample[i] === 0) return true;
  return false;
}

export async function readFileBytes(relativePath: string): Promise<Buffer | null> {
  try {
    return await readFile(absoluteStoragePath(relativePath));
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function deleteStoredFile(relativePath: string): Promise<boolean> {
  try {
    await rm(absoluteStoragePath(relativePath), { force: true });
    return true;
  } catch {
    return false;
  }
}

export async function storageUsageBytes(userId: string): Promise<number> {
  const dir = absoluteStoragePath(userId);
  try {
    const entries = await (await import("node:fs/promises")).readdir(dir, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const info = await stat(path.join(dir, entry.name)).catch(() => null);
      if (info) total += info.size;
    }
    return total;
  } catch {
    return 0;
  }
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export async function ensureRuntimeDirs() {
  await mkdir(config.storageRoot, { recursive: true });
  await mkdir(path.resolve(process.cwd(), "data"), { recursive: true });
}
