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
  const raw = String(process.env.STORAGE_DRIVER || "local").trim().toLowerCase();
  if (raw !== "local" && raw !== "s3") {
    throw new Error(
      `STORAGE_DRIVER must be "local" (disk) or "s3" (object storage), but the server environment says "${raw}".`,
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

/** Honest one-liner for the Settings screen: where bytes actually go. */
export function storageDescription(): string {
  return storageDriver().describe();
}

export type { StorageDriver, StorageDriverId };
