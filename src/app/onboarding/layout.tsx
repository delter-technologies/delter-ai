import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Onboarding gate.
 *
 * Onboarding is shown only when it is genuinely still needed:
 *   - signed out            → /signin
 *   - already onboarded     → /app (so a returning user never sees it twice)
 *   - signed in, not done   → the onboarding flow, which routes into /app the
 *                             moment it completes
 *
 * A user is never left stuck here: completing it sets `onboardedAt` and the
 * client navigates to the workspace in the same interaction.
 */
export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/signin");
  if (session.user.onboardedAt) redirect("/app");

  return <>{children}</>;
}
