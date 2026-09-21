import "server-only";
import { createHash } from "node:crypto";
import path from "node:path";
import { config } from "@/lib/config";
import { redactSecrets } from "@/lib/redact";
import { storageDriver } from "@/lib/storage-drivers";
import { absoluteStoragePath } from "@/lib/storage-drivers/local";

/**
 * File storage.
 *
 * Three things are deliberately kept apart, per the data model:
 *   - metadata   → FileAsset row (name, mime, size, project, hash)
 *   - contents   → bytes behind the storage driver (local disk or object store)
 *   - storage    → the key recorded on the metadata row
 *
 * Nothing is written to a path derived from user input: the filename is
 * sanitised for display only, and the stored name is a server-generated id.
 * A row is never created unless the bytes are already stored, so Delter AI never
 * claims an upload succeeded when it did not.
 *
 * The driver is chosen by STORAGE_DRIVER (`local` or `s3`). Everything above
 * this module — the upload route, the download route, the storage meter — is
 * identical either way, which is what makes moving to a serverless host a
 * configuration change rather than a rewrite.
 */

export { absoluteStoragePath };
export { storageDescription } from "@/lib/storage-drivers";

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

/** Storage key for a user's file: `<userId>/<fileId><ext>`. */
export function storagePathFor(userId: string, fileId: string, ext: string): string {
  const safeExt = /^\.[a-z0-9]{1,10}$/i.test(ext) ? ext.toLowerCase() : "";
  return path.posix.join(userId, `${fileId}${safeExt}`);
}

/** Prefix under which one user's files live, in either driver. */
export function storagePrefixFor(userId: string): string {
  return `${userId}/`;
}

export type StoredFile = {
  storagePath: string;
  size: number;
  sha256: string;
  textContent: string | null;
  extractable: boolean;
  truncatedText: boolean;
};

/**
 * Persist bytes through the configured driver.
 *
 * Throws if the write fails or cannot be confirmed — the caller must not create
 * a FileAsset row in that case.
 */
export async function storeFile(
  userId: string,
  fileId: string,
  bytes: Buffer,
  opts: { name: string; ext: string; mimeType: string | null },
): Promise<StoredFile> {
  const relativePath = storagePathFor(userId, fileId, opts.ext);
  const stored = await storageDriver().put(relativePath, bytes, opts.mimeType);

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
    size: stored.size,
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
  return storageDriver().get(relativePath);
}

export async function deleteStoredFile(relativePath: string): Promise<boolean> {
  try {
    return await storageDriver().remove(relativePath);
  } catch {
    return false;
  }
}

export async function storageUsageBytes(userId: string): Promise<number> {
  try {
    return await storageDriver().usageBytes(storagePrefixFor(userId));
  } catch (error) {
    // A meter must never break the page it appears on. Report zero and log why.
    console.error("[delter-ai] storage usage could not be measured:", error instanceof Error ? error.message : error);
    return 0;
  }
}

/**
 * Why a write failed, in the driver's own words.
 *
 * A generic "could not be saved" is useless when the real cause is a missing
 * bucket variable, a denied key or an unreachable endpoint — all of which the
 * driver already knows precisely. The detail is capped so an SDK stack trace
 * cannot swamp the upload list.
 */
export function storageFailureMessage(error: unknown): string {
  // Storage SDK errors can include access keys, signed URLs or endpoint credentials.
  const detail =
    error instanceof Error
      ? redactSecrets(error.message).replace(/\s+/g, " ").trim()
      : "";
  const base = "The file could not be saved to storage.";
  if (!detail) return `${base} Please retry.`;
  const clipped = detail.length > 300 ? `${detail.slice(0, 299)}…` : detail;
  return `${base} ${clipped}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

/** Idempotent start-up work for the active driver (mkdir for local, config check for s3). */
export async function ensureRuntimeDirs() {
  const driver = storageDriver();
  await driver.prepare();
  if (driver.id === "local") {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.resolve(process.cwd(), "data"), { recursive: true });
  }
}
