import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";
import type { StorageDriver } from "./types";

/**
 * Local-disk driver.
 *
 * Right for development and for any host with a persistent volume. It is the
 * wrong choice on a serverless platform, where the filesystem is read-only and
 * per-request — use the `s3` driver there.
 */

/**
 * Resolve a stored key against the storage root and prove it stays inside.
 *
 * Keys are server-generated (`<userId>/<fileId><ext>`), never user-supplied,
 * but the containment check stays: it is what turns a future mistake into a
 * thrown error instead of a read or write somewhere unexpected.
 */
export function absoluteStoragePath(relativePath: string): string {
  const root = path.resolve(config.storageRoot);
  const abs = path.resolve(root, relativePath);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error("Refusing to resolve a storage path outside the storage root.");
  }
  return abs;
}

export const localDriver: StorageDriver = {
  id: "local",

  describe() {
    return `Local disk under ${config.storageRoot}`;
  },

  async put(key, bytes) {
    const abs = absoluteStoragePath(key);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, bytes);
    // Confirm the bytes really landed before anything claims success.
    const info = await stat(abs);
    return { size: info.size };
  },

  async get(key) {
    try {
      return await readFile(absoluteStoragePath(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      throw error;
    }
  },

  async remove(key) {
    try {
      await rm(absoluteStoragePath(key), { force: true });
      return true;
    } catch {
      return false;
    }
  },

  async usageBytes(prefix) {
    const dir = absoluteStoragePath(prefix);
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      let total = 0;
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const info = await stat(path.join(dir, entry.name)).catch(() => null);
        if (info) total += info.size;
      }
      return total;
    } catch {
      // No directory yet means nothing stored.
      return 0;
    }
  },

  async prepare() {
    await mkdir(config.storageRoot, { recursive: true });
  },
};
