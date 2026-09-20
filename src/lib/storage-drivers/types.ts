/**
 * The storage driver contract.
 *
 * Delter AI keeps file *metadata* in the database and file *bytes* behind this
 * interface, so the same upload, download, delete and usage code runs against a
 * local disk in development and an S3-compatible object store in production.
 *
 * Two rules every driver must honour:
 *   - `put` must confirm the bytes actually landed and report the stored size.
 *     The caller only writes a FileAsset row after that, so Delter AI never
 *     claims an upload succeeded when it did not.
 *   - `get` returns `null` for a missing object instead of throwing, and
 *     `remove` reports whether anything was deleted. Any other failure must
 *     throw, so the caller can show a real error rather than a blank screen.
 */

export type StorageDriverId = "local" | "s3";

export type StorageDriver = {
  readonly id: StorageDriverId;

  /** One honest line about where bytes actually go. Never includes a secret. */
  describe(): string;

  /** Write bytes under `key` and confirm they landed. */
  put(key: string, bytes: Buffer, contentType: string | null): Promise<{ size: number }>;

  /** Read bytes, or `null` when the object does not exist. */
  get(key: string): Promise<Buffer | null>;

  /** Delete an object. Missing objects count as deleted. */
  remove(key: string): Promise<boolean>;

  /** Total stored bytes under a prefix (used for the storage meter). */
  usageBytes(prefix: string): Promise<number>;

  /** Idempotent start-up work: creating directories, validating configuration. */
  prepare(): Promise<void>;
};
