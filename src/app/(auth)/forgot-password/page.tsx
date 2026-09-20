import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email you signed up with and Delter AI will start a password reset."
      footer={
        <>
          Remembered it?{" "}
          <a href="/signin" className="font-medium text-accent-text underline underline-offset-2 hover:no-underline">
            Sign in
          </a>
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
