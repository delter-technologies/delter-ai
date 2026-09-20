import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignUpForm } from "@/components/auth/SignUpForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create account" };

/**
 * Sign up.
 *
 * On success the server signs the user in immediately and the client goes to
 * `/onboarding`, which routes straight into the workspace when finished. Nobody
 * is parked on the landing page after creating an account.
 */
export default async function SignUpPage() {
  const session = await getSession();
  if (session) redirect(session.user.onboardedAt ? "/app" : "/onboarding");

  return (
    <AuthShell
      title="Create your Delter AI account"
      subtitle="One account for your projects, files, conversations and code."
      footer={
        <>
          Already have an account?{" "}
          <a href="/signin" className="font-medium text-accent-text underline underline-offset-2 hover:no-underline">
            Sign in
          </a>
        </>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
