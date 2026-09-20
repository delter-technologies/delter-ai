import { config } from "@/lib/config";
import type { StorageDriver } from "./types";

/**
 * S3-compatible object storage driver.
 *
 * Works with anything that speaks the S3 API: Cloudflare R2, Supabase Storage,
 * AWS S3 and MinIO. This is the driver a serverless deployment needs, because
 * those platforms give a request a read-only, throwaway filesystem.
 *
 * The SDK is imported lazily so a local-disk install never pays for it, and no
 * credential is ever included in an error message or in `describe()`.
 */

type S3Sdk = typeof import("@aws-sdk/client-s3");
type S3ClientInstance = InstanceType<S3Sdk["S3Client"]>;

let sdkPromise: Promise<S3Sdk> | null = null;
let clientPromise: Promise<S3ClientInstance> | null = null;

function loadSdk(): Promise<S3Sdk> {
  if (!sdkPromise) {
    sdkPromise = import("@aws-sdk/client-s3").catch((error: unknown) => {
      sdkPromise = null;
      throw error;
    });
  }
  return sdkPromise;
}

/** Names the S3 API uses for "that object is not there". */
function isMissing(error: unknown): boolean {
  const name = (error as { name?: string })?.name ?? "";
  const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
  return name === "NoSuchKey" || name === "NotFound" || name === "NoSuchBucket" || status === 404;
}

function missingConfig(): string[] {
  const missing: string[] = [];
  if (!config.s3.bucket) missing.push("S3_BUCKET");
  if (!config.s3.accessKeyId) missing.push("S3_ACCESS_KEY_ID");
  if (!config.s3.secretAccessKey) missing.push("S3_SECRET_ACCESS_KEY");
  return missing;
}

function assertConfigured(): void {
  const missing = missingConfig();
  if (missing.length) {
    throw new Error(
      `Delter AI is configured to store uploads in object storage (STORAGE_DRIVER=s3) but ${missing.join(
        ", ",
      )} ${missing.length === 1 ? "is" : "are"} not set in the server environment. Set ${
        missing.length === 1 ? "it" : "them"
      }, or set STORAGE_DRIVER=local to keep uploads on disk.`,
    );
  }
}

async function getClient(): Promise<{ sdk: S3Sdk; client: S3ClientInstance }> {
  assertConfigured();
  if (!clientPromise) {
    clientPromise = (async () => {
      const sdk = await loadSdk();
      return new sdk.S3Client({
        region: config.s3.region,
        ...(config.s3.endpoint ? { endpoint: config.s3.endpoint } : {}),
        forcePathStyle: config.s3.forcePathStyle,
        credentials: {
          accessKeyId: config.s3.accessKeyId,
          secretAccessKey: config.s3.secretAccessKey,
        },
      });
    })().catch((error: unknown) => {
      // Do not cache a failed construction: the next call should try again.
      clientPromise = null;
      throw error;
    });
  }
  const sdk = await loadSdk();
  return { sdk, client: await clientPromise };
}

/** Object key for a stored file, including the optional environment prefix. */
function objectKey(key: string): string {
  const prefix = config.s3.prefix.replace(/^\/+|\/+$/g, "");
  const clean = key.replace(/^\/+/, "");
  return prefix ? `${prefix}/${clean}` : clean;
}

export const s3Driver: StorageDriver = {
  id: "s3",

  describe() {
    const bucket = config.s3.bucket || "(no bucket configured)";
    const where = config.s3.endpoint ? config.s3.endpoint.replace(/^https?:\/\//, "") : `AWS S3 (${config.s3.region})`;
    const prefix = config.s3.prefix ? `, prefix "${config.s3.prefix.replace(/^\/+|\/+$/g, "")}"` : "";
    return `Object storage bucket "${bucket}" at ${where}${prefix}`;
  },

  async put(key, bytes, contentType) {
    const { sdk, client } = await getClient();
    const Bucket = config.s3.bucket;
    const Key = objectKey(key);

    await client.send(
      new sdk.PutObjectCommand({
        Bucket,
        Key,
        Body: new Uint8Array(bytes),
        ...(contentType ? { ContentType: contentType } : {}),
      }),
    );

    // Confirm the object is really there, and report the size the store holds.
    try {
      const head = await client.send(new sdk.HeadObjectCommand({ Bucket, Key }));
      return { size: head.ContentLength ?? bytes.length };
    } catch (error) {
      if (isMissing(error)) {
        throw new Error(`The upload was accepted but the object "${Key}" could not be found afterwards.`);
      }
      // Some bucket policies deny HeadObject while allowing PutObject. The write
      // itself succeeded, so report the size we sent rather than failing.
      return { size: bytes.length };
    }
  },

  async get(key) {
    const { sdk, client } = await getClient();
    try {
      const res = await client.send(
        new sdk.GetObjectCommand({ Bucket: config.s3.bucket, Key: objectKey(key) }),
      );
      const body = res.Body;
      if (!body) return null;
      return Buffer.from(await body.transformToByteArray());
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  },

  async remove(key) {
    const { sdk, client } = await getClient();
    try {
      await client.send(
        new sdk.DeleteObjectCommand({ Bucket: config.s3.bucket, Key: objectKey(key) }),
      );
      // S3 delete is idempotent: a missing key is still a deleted key.
      return true;
    } catch (error) {
      if (isMissing(error)) return true;
      throw error;
    }
  },

  async usageBytes(prefix) {
    const { sdk, client } = await getClient();
    const Bucket = config.s3.bucket;
    const Prefix = objectKey(prefix.replace(/\/+$/, "") + "/");
    let total = 0;
    let token: string | undefined;

    do {
      const page = await client.send(
        new sdk.ListObjectsV2Command({
          Bucket,
          Prefix,
          ...(token ? { ContinuationToken: token } : {}),
        }),
      );
      for (const item of page.Contents ?? []) total += item.Size ?? 0;
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);

    return total;
  },

  async prepare() {
    // Validate configuration without a network call: some bucket policies deny
    // HeadBucket while allowing reads and writes, so a probe here would produce
    // a false failure. A real problem surfaces on the first upload, with the
    // provider's own message.
    assertConfigured();
  },
};
