"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";

/**
 * Reset password form.
 *
 * Handles the three real failure modes separately — no token, an invalid or
 * already-used token, and an expired one — each with a route back to requesting
 * a fresh link rather than a dead end.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div
        className="rounded-lg border p-4"
        style={{ borderColor: "color-mix(in srgb, var(--warning) 35%, var(--border))", background: "var(--warning-soft)" }}
      >
        <p className="text-[13px] font-semibold" style={{ color: "var(--warning)" }}>
          This reset link is incomplete
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-fg-secondary">
          There is no reset token in the address, so Delter AI cannot verify this request. Ask for a new link.
        </p>
        <Link
          href="/forgot-password"
          className="mt-4 inline-flex h-9 items-center justify-center rounded-md px-3.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--accent)" }}
        >
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4">
        <div
          className="rounded-lg border p-4"
          style={{ borderColor: "color-mix(in srgb, var(--success) 35%, var(--border))", background: "var(--success-soft)" }}
        >
          <p className="text-[13px] font-semibold" style={{ color: "var(--success)" }}>
            Your password has been updated
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-fg-secondary">
            Every other session on your account has been signed out. Sign in with your new password to get back to your
            workspace.
          </p>
        </div>
        <Link
          href="/signin"
          className="inline-flex h-10 w-full items-center justify-center rounded-lg px-4 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--accent)" }}
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    setFieldErrors({});

    const errors: Record<string, string> = {};
    if (password.length < 8) errors.password = "Passwords must be at least 8 characters.";
    if (!confirm) errors.confirm = "Repeat your new password.";
    else if (confirm !== password) errors.confirm = "Those two passwords do not match.";

    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      await api.post<{ reset: boolean }>("/api/auth/reset-password", { token, password });
      setDone(true);
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught, "Delter AI could not update your password. Please try again."));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {error ? (
        <div
          role="alert"
          className="rounded-lg border px-3.5 py-3 text-[13px] leading-relaxed"
          style={{ borderColor: "color-mix(in srgb, var(--danger) 38%, var(--border))", background: "var(--danger-soft)" }}
        >
          <p className="font-medium" style={{ color: "var(--danger)" }}>
            {error}
          </p>
          {/invalid|expired|used/i.test(error) ? (
            <Link href="/forgot-password" className="mt-1.5 inline-block font-medium text-fg-secondary underline underline-offset-2 hover:no-underline">
              Request a new reset link
            </Link>
          ) : null}
        </div>
      ) : null}

      <Input
        label="New password"
        type="password"
        name="new-password"
        autoComplete="new-password"
        autoFocus
        required
        placeholder="At least 8 characters"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={fieldErrors.password}
        disabled={submitting}
      />

      <Input
        label="Confirm new password"
        type="password"
        name="confirm-password"
        autoComplete="new-password"
        required
        placeholder="Repeat it"
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
        error={fieldErrors.confirm}
        disabled={submitting}
      />

      <Button type="submit" variant="primary" size="lg" block loading={submitting} loadingLabel="Updating…">
        Update password
      </Button>
    </form>
  );
}
