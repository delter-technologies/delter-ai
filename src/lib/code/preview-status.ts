/**
 * Preview types, kept in their own module because they are needed on both sides
 * of the wire: the server computes the status from stored files, and Code Studio
 * renders it. `preview.ts` (which is server-only) re-exports these, so there is
 * one definition rather than a client-side copy that can drift.
 */

export type PreviewCodeFile = {
  path: string;
  content: string;
};

export type PreviewStatus =
  | { previewable: true; entryPath: string; mode: "html" | "markdown" | "asset" | "none"; note?: string }
  | { previewable: false; reason: string; hint?: string };
