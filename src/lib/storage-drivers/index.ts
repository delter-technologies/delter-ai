import "server-only";
import { localDriver } from "./local";
import { s3Driver } from "./s3";
import type { StorageDriver, StorageDriverId } from "./types";

/**
 * Driver selection.
 *
 * STORAGE_DRIVER decides where uploaded bytes live. An unrecognised value is a
 * configuration mistake, so it throws with the value it was given instead of
 * quietly falling back to the local disk — a silent fallback on a serverless
 * host would mean uploads disappearing between requests while the UI reported
 * success.
 */

let cached: StorageDriver | null = null;
let cachedFor: string | null = null;

function resolveId(): StorageDriverId {
  const raw = String(process.env.STORAGE_DRIVER ?? "").trim().toLowerCase();
  const isProduction = process.env.NODE_ENV === "production";
  const onVercel = Boolean(process.env.VERCEL);

  if (!raw) {
    // Development defaults to disk so a fresh clone works with no configuration.
    if (!isProduction) return "local";
    throw new Error(
      `STORAGE_DRIVER must be set explicitly in production: "s3" for a serverless host, or "local" for a host with a persistent volume.${
        onVercel
          ? ' This process is running on Vercel, whose filesystem is read-only and per-request, so STORAGE_DRIVER="s3" is required.'
          : ""
      } Delter AI will not guess, because defaulting to "local" on a serverless host would accept uploads and then lose them.`,
    );
  }

  if (raw !== "local" && raw !== "s3") {
    throw new Error(
      `STORAGE_DRIVER must be "local" (disk) or "s3" (object storage), but the server environment says "${raw}".`,
    );
  }

  if (raw === "local" && onVercel) {
    throw new Error(
      'STORAGE_DRIVER="local" cannot work on Vercel: the filesystem is read-only and each request may run on a fresh container, so uploads would fail or disappear. Set STORAGE_DRIVER="s3" with an S3-compatible bucket (see DEPLOY.md), or run Delter AI on a host with a persistent volume.',
    );
  }

  return raw;
}

export function storageDriver(): StorageDriver {
  const id = resolveId();
  if (cached && cachedFor === id) return cached;
  cached = id === "s3" ? s3Driver : localDriver;
  cachedFor = id;
  return cached;
}

/**
 * Honest one-liner for the Settings screen: where bytes actually go.
 *
 * A server whose storage is misconfigured still has to render Settings — the
 * panel then says exactly what is wrong, instead of the whole page failing to
 * load. Uploads keep failing loudly, because they call `storageDriver()`
 * directly and that throws.
 */
export function storageDescription(): string {
  try {
    return storageDriver().describe();
  } catch (error) {
    // Read as part of a sentence in Settings → Account ("Uploaded file bytes live
    // in …"), so it starts as a noun phrase and then says what to fix.
    return `an unconfigured storage backend: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export type { StorageDriver, StorageDriverId };
