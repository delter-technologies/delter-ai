import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { OnboardingClient } from "@/components/onboarding/OnboardingClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up your workspace" };

/**
 * Onboarding.
 *
 * Three short steps that give Delter AI real context to work with: how to
 * address you, what you mainly use it for, and which kinds of work you care
 * about. Those answers become part of the system prompt for every conversation,
 * so this is not a questionnaire for its own sake — it changes how the assistant
 * answers.
 *
 * Every step can be skipped, and finishing routes straight into the workspace.
 */
export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/signin");
  if (session.user.onboardedAt) redirect("/app");

  return (
    <OnboardingClient
      initial={{
        displayName: session.user.displayName ?? session.user.name ?? "",
        mainPurpose: session.user.mainPurpose ?? "",
        interests: session.user.interests ? session.user.interests.split(",").map((value) => value.trim()).filter(Boolean) : [],
      }}
      email={session.user.email}
    />
  );
}
