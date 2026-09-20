"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { api, errorMessage } from "@/lib/client/api";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input } from "@/components/ui/Field";

/**
 * Sign-in form.
 *
 * On success it navigates to wherever the server said to go — `/app` for a
 * returning user, `/onboarding` for one who has not finished it — and refreshes
 * the router so every server component re-renders against the new session. The
 * user is never left sitting on this page after a successful sign-in.
 */
export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    setFieldErrors({});

    if (!email.trim()) {
      setFieldErrors({ email: "Enter your email address." });
      return;
    }
    if (!password) {
      setFieldErrors({ password: "Enter your password." });
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.post<{ redirectTo: string }>("/api/auth/signin", {
        email: email.trim(),
        password,
        remember,
        next,
      });

      // Refresh first so the destination renders with the authenticated session.
      router.refresh();
      router.replace(result.redirectTo || "/app");
    } catch (caught) {
      const message = errorMessage(caught, "Unable to sign you in. Please check your details and try again.");
      setError(message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {error ? (
        <div
          role="alert"
          className="rounded-lg border px-3.5 py-2.5 text-[13px] leading-relaxed"
          style={{ borderColor: "color-mix(in srgb, var(--danger) 38%, var(--border))", background: "var(--danger-soft)", color: "var(--text-secondary)" }}
        >
          <span className="font-medium" style={{ color: "var(--danger)" }}>
            {error}
          </span>{" "}
          <Link href="/forgot-password" className="underline underline-offset-2 hover:no-underline">
            Reset your password
          </Link>
        </div>
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
        error={fieldErrors.email}
        disabled={submitting}
      />

      <div>
        <Input
          label="Password"
          labelExtra={
            <Link href="/forgot-password" className="font-medium text-accent-text hover:underline">
              Forgot?
            </Link>
          }
          type={showPassword ? "text" : "password"}
          name="password"
          autoComplete="current-password"
          required
          placeholder="Your password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password}
          disabled={submitting}
        />
        <button
          type="button"
          onClick={() => setShowPassword((value) => !value)}
          className="mt-1.5 text-[12px] text-fg-muted underline-offset-2 hover:text-fg hover:underline"
        >
          {showPassword ? "Hide password" : "Show password"}
        </button>
      </div>

      <Checkbox
        label="Keep me signed in"
        description="Extends this session to 60 days on this device."
        checked={remember}
        onChange={(event) => setRemember(event.target.checked)}
        disabled={submitting}
      />

      <Button type="submit" variant="primary" size="lg" block loading={submitting} loadingLabel="Signing in…">
        Sign in
      </Button>
    </form>
  );
}
