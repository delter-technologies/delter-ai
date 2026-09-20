import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose a new password" };

/**
 * Reset password. The token arrives from the link in `/forgot-password`; the
 * form validates it on the server before the new password is accepted.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawToken = Array.isArray(params.token) ? params.token[0] : params.token;

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="After this, every device signed in to your Delter AI account is signed out."
    >
      <ResetPasswordForm token={rawToken ?? ""} />
    </AuthShell>
  );
}
