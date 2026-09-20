import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignInForm } from "@/components/auth/SignInForm";
import { safeNextPath } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

/**
 * Sign in.
 *
 * A user who already has a valid session is sent into the workspace rather than
 * being shown a form they do not need. `next` is validated to an internal path
 * so this route cannot be used as an open redirect.
 */
export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  if (session) redirect(session.user.onboardedAt ? "/app" : "/onboarding");

  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = safeNextPath(rawNext ?? null, "/app");

  return (
    <AuthShell
      title="Sign in to Delter AI"
      subtitle="You will go straight into your workspace."
      footer={
        <>
          No account yet?{" "}
          <a href="/signup" className="font-medium text-accent-text underline underline-offset-2 hover:no-underline">
            Create one
          </a>
        </>
      }
    >
      <SignInForm next={next} />
    </AuthShell>
  );
}
