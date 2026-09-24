import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { ThemeScript } from "@/components/system/ThemeScript";
import { Providers } from "@/components/system/Providers";

export const metadata: Metadata = {
  title: {
    default: "Delter AI — one workspace for AI work",
    template: "%s · Delter AI",
  },
  description:
    "Delter AI is a unified AI workspace by Delter Technologies: chat, projects, files, Code Studio and more, with the AI aware of what you are working on.",
  applicationName: "Delter AI",
  authors: [{ name: "Delter Technologies" }],
  creator: "Delter Technologies",
  publisher: "Delter Technologies",
  keywords: ["Delter AI", "Delter Technologies", "AI workspace", "code studio", "AI projects"],
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Delter AI",
    description: "One workspace where the AI understands your projects, files and conversations.",
    siteName: "Delter AI",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Code Studio and Chat both need the full viewport on mobile; never zoom on focus.
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0e11" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before first paint so a dark-theme user never sees a white flash. */}
        <ThemeScript />
      </head>
      <body>
        <Providers>{children}</Providers>
        {/*
          Vercel Web Analytics: page views for the deployed site. It loads
          /_vercel/insights/script.js, which the Vercel platform serves; on a
          self-hosted deploy that request simply does not resolve and nothing is
          collected. No cookies, and it reads no environment secrets.
        */}
        <Analytics />
      </body>
    </html>
  );
}
