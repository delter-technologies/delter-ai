"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";

type DeliveryResult = {
  delivery: "sent" | "dev" | "none";
  message: string;
  resetPath?: string;
};

/**
 * Forgot password.
 *
 * The response tells the truth about delivery instead of always claiming an
 * email was sent:
 *
 *   - `sent`  → a delivery service is configured; the user waits for an email.
 *   - `dev`   → no delivery service is configured on this server, so the reset
 *               link is shown here. That is the honest behaviour for a local or
 *               staging deployment, and it makes recovery testable.
 *   - `none`  → the address is not registered. The neutral message is shown so
 *               this form cannot be used to enumerate accounts.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeliveryResult | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    setResult(null);

    if (!email.trim()) {
      setError("Enter the email address for your account.");
      return;
    }

    setSubmitting(true);
    try {
      const data = await api.post<DeliveryResult>("/api/auth/forgot-password", { email: email.trim() });
      setResult(data);
    } catch (caught) {
      setError(errorMessage(caught, "Delter AI could not start that password reset. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        <div
          className="rounded-lg border p-4"
          style={{
            borderColor: result.delivery === "dev" ? "color-mix(in srgb, var(--warning) 35%, var(--border))" : "var(--border)",
            background: result.delivery === "dev" ? "var(--warning-soft)" : "var(--success-soft)",
          }}
        >
          <p className="text-[13px] font-semibold" style={{ color: result.delivery === "dev" ? "var(--warning)" : "var(--success)" }}>
            {result.delivery === "sent"
              ? "Reset link sent"
              : result.delivery === "dev"
                ? "No email service configured — link shown here"
                : "Request received"}
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-fg-secondary">{result.message}</p>

          {result.resetPath ? (
            <div className="mt-3.5 rounded-md border bg-surface p-3" style={{ borderColor: "var(--border)" }}>
              <p className="label-caps mb-2">Your reset link</p>
              <Link
                href={result.resetPath}
                className="block rounded-md px-3 py-2 text-center text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: "var(--accent)" }}
              >
                Continue to reset your password
              </Link>
              <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-fg-faint">{result.resetPath}</p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="secondary"
            onClick={() => {
              setResult(null);
              setEmail("");
            }}
            block
          >
            Use a different email
          </Button>
          <Link
            href="/signin"
            className="inline-flex h-9 flex-1 items-center justify-center rounded-md px-3.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--accent)" }}
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {error ? (
        <p
          role="alert"
          className="rounded-lg border px-3.5 py-2.5 text-[13px] font-medium leading-relaxed"
          style={{ borderColor: "color-mix(in srgb, var(--danger) 38%, var(--border))", background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          {error}
        </p>
      ) : null}

      <Input
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        autoFocus
        required
        placeholder="you@company.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={submitting}
        hint="The link expires after one hour and can only be used once."
      />

      <Button type="submit" variant="primary" size="lg" block loading={submitting} loadingLabel="Checking…">
        Send reset link
      </Button>
    </form>
  );
}
