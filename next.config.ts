import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a production build run beside the dev server without clobbering .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  // The workspace is previewed through a sandboxed host (https://<port>-<id>.e2b.app).
  // Without this, Next blocks its own dev resources (HMR, chunk metadata) as
  // cross-origin and the client bundle never hydrates — which leaves forms doing
  // native GET submissions instead of calling the API.
  allowedDevOrigins: ["*.e2b.app", "3000-i4txo9ver9k2g210b46nh.e2b.app"],
  // Prisma's generated client is emitted into src/generated/prisma and is read at
  // runtime by the server. Keep it out of the bundle so the query engine resolves
  // from disk instead of being inlined.
  serverExternalPackages: ["@prisma/client", "prisma", "bcryptjs"],
  experimental: {
    // Uploads are streamed to disk in chunks; allow generous bodies for file uploads.
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  async headers() {
    return [
      {
        source: "/api/preview/:path*",
        headers: [
          // Generated user code is served from an isolated origin path and rendered
          // inside a sandboxed iframe. Keep it out of the app's own browsing context.
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Security-Policy", value: "default-src 'self' data: blob: https:; script-src 'unsafe-inline' 'unsafe-eval' https: data: blob:; style-src 'unsafe-inline' https:; img-src * data: blob:; font-src * data:; connect-src * data: blob:; frame-ancestors *" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
