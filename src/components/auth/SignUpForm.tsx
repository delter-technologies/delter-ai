"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input } from "@/components/ui/Field";

/**
 * Sign-up form.
 *
 * Validation runs in the browser first (so the feedback is instant) and again on
 * the server, because the server is the only place it can be trusted. On success
 * the account is created, the session is set and the user is routed to
 * onboarding — never left on this page.
 */
export function SignUpForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const strength = useMemo(() => assessPassword(password), [password]);

  function validate(): boolean {
    const errors: Record<string, string> = {};

    if (!name.trim()) errors.name = "Enter your name.";
    else if (name.trim().length < 2) errors.name = "That name looks too short.";

    if (!email.trim()) errors.email = "Enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) errors.email = "Enter a valid email address, for example you@company.com.";

    if (!password) errors.password = "Choose a password.";
    else if (password.length < 8) errors.password = "Passwords must be at least 8 characters.";

    if (!confirm) errors.confirm = "Repeat your password.";
    else if (confirm !== password) errors.confirm = "Those two passwords do not match.";

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    setFormError(null);
    if (!validate()) return;
    if (!agreed) {
      setFormError("Please confirm you want to create this Delter AI account.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.post<{ redirectTo: string }>("/api/auth/signup", {
        name: name.trim(),
        email: email.trim(),
        password,
      });

      router.refresh();
      router.replace(result.redirectTo || "/onboarding");
    } catch (caught) {
      const message = errorMessage(caught, "We could not create that account. Please try again.");
      if (caught && typeof caught === "object" && "code" in caught && caught.code === "email_taken") {
        setFieldErrors({ email: message });
      } else {
        setFormError(message);
      }
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError ? (
        <p
          role="alert"
          className="rounded-lg border px-3.5 py-2.5 text-[13px] font-medium leading-relaxed"
          style={{ borderColor: "color-mix(in srgb, var(--danger) 38%, var(--border))", background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          {formError}
        </p>
      ) : null}

      <Input
        label="Name"
        name="name"
        autoComplete="name"
        autoFocus
        required
        placeholder="Your name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={fieldErrors.name}
        disabled={submitting}
      />

      <Input
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
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
          type="password"
          name="new-password"
          autoComplete="new-password"
          required
          placeholder="At least 8 characters"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password}
          disabled={submitting}
          hint="Stored as a bcrypt hash. Delter AI cannot read your password."
        />
        {password ? (
          <div className="mt-2" aria-hidden={false}>
            <div className="flex gap-1" role="img" aria-label={`Password strength: ${strength.label}`}>
              {[0, 1, 2, 3].map((index) => (
                <span
                  key={index}
                  className="h-1 flex-1 rounded-full transition-colors"
                  style={{
                    background: index < strength.score ? strength.color : "var(--border)",
                  }}
                />
              ))}
            </div>
            <p className="mt-1.5 text-[12px]" style={{ color: strength.color }}>
              {strength.label}
              {strength.advice ? <span className="text-fg-muted"> — {strength.advice}</span> : null}
            </p>
          </div>
        ) : null}
      </div>

      <Input
        label="Confirm password"
        type="password"
        name="confirm-password"
        autoComplete="new-password"
        required
        placeholder="Repeat your password"
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
        error={fieldErrors.confirm}
        disabled={submitting}
      />

      <Checkbox
        label="Create my Delter AI account"
        description="Your projects, files and conversations belong to your account and are isolated from every other user."
        checked={agreed}
        onChange={(event) => setAgreed(event.target.checked)}
        disabled={submitting}
      />

      <Button type="submit" variant="primary" size="lg" block loading={submitting} loadingLabel="Creating account…">
        Create account
      </Button>

      <p className="text-center text-[12px] leading-relaxed text-fg-muted">
        After a short onboarding you go straight into your workspace.
      </p>
    </form>
  );
}

function assessPassword(password: string): { score: number; label: string; color: string; advice?: string } {
  if (!password) return { score: 0, label: "", color: "var(--text-muted)" };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password) || /[^\w\s]/.test(password)) score++;
  score = Math.min(4, score);

  const common = ["password", "12345678", "qwerty", "letmein", "delterai", "password1"];
  if (common.some((item) => password.toLowerCase().includes(item))) {
    return { score: 1, label: "Weak", color: "var(--danger)", advice: "that is a commonly used password" };
  }

  if (score <= 1) return { score: 1, label: "Weak", color: "var(--danger)", advice: "add length or mix characters" };
  if (score === 2) return { score: 2, label: "Fair", color: "var(--warning)", advice: "longer is better" };
  if (score === 3) return { score: 3, label: "Good", color: "var(--success)" };
  return { score: 4, label: "Strong", color: "var(--success)" };
}
