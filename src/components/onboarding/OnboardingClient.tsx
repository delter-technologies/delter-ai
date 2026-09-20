"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";
import { IconArrowRight, IconCheck, IconLogo } from "@/components/ui/Icons";

/**
 * The onboarding flow itself.
 *
 * Deliberately short: three steps, each skippable, one submit at the end. The
 * last thing it does is navigate to `/app` — it never leaves a user sitting on
 * onboarding, and once `onboardedAt` is set the route redirects away forever.
 */

const PURPOSES = [
  { id: "build", label: "Build software", note: "Code Studio, projects, technical work" },
  { id: "write", label: "Write and edit", note: "Drafts, documents, rewriting, summaries" },
  { id: "research", label: "Research and analyse", note: "Topics, sources, structured notes" },
  { id: "design", label: "Design and create", note: "Websites, visuals, presentations" },
  { id: "operate", label: "Run day-to-day work", note: "Planning, files, routine tasks" },
  { id: "explore", label: "Exploring what it can do", note: "No fixed purpose yet" },
];

const INTERESTS = [
  "Web development",
  "TypeScript",
  "Python",
  "Data analysis",
  "Writing",
  "Marketing",
  "Product design",
  "Startups",
  "Education",
  "Finance",
  "Healthcare",
  "Research",
  "Automation",
  "APIs",
  "Mobile apps",
  "Machine learning",
];

type Step = 0 | 1 | 2;

export function OnboardingClient({
  initial,
  email,
}: {
  initial: { displayName: string; mainPurpose: string; interests: string[] };
  email: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [purpose, setPurpose] = useState(initial.mainPurpose);
  const [customPurpose, setCustomPurpose] = useState(
    initial.mainPurpose && !PURPOSES.some((option) => option.label === initial.mainPurpose) ? initial.mainPurpose : "",
  );
  const [interests, setInterests] = useState<string[]>(initial.interests);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosenPurpose = customPurpose.trim() || purpose;

  function toggleInterest(value: string) {
    setInterests((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value].slice(0, 12),
    );
  }

  async function finish(event?: FormEvent) {
    event?.preventDefault();
    if (submitting) return;

    setError(null);
    setSubmitting(true);

    try {
      const result = await api.post<{ redirectTo: string }>("/api/onboarding", {
        displayName: displayName.trim() || null,
        mainPurpose: chosenPurpose.trim() || null,
        interests,
      });

      // Refresh first so the workspace renders against the onboarded session,
      // then go in. Nothing between the submit and the workspace.
      router.refresh();
      router.replace(result.redirectTo || "/app");
    } catch (caught) {
      setError(errorMessage(caught, "Delter AI could not finish setting up your workspace. Please try again."));
      setSubmitting(false);
    }
  }

  const steps = ["Your name", "Main purpose", "Interests"];

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex items-center gap-2.5">
          <span style={{ color: "var(--accent)" }}>
            <IconLogo size={22} />
          </span>
          <span className="text-[14.5px] font-semibold tracking-[-0.02em] text-fg">Delter AI</span>
          <span className="ml-auto text-[12px] text-fg-muted">{email}</span>
        </div>

        <div className="mt-8 flex-1">
          <h1 className="text-[24px] font-semibold tracking-[-0.025em] text-fg sm:text-[27px]">
            Set up your workspace
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-fg-secondary">
            Three short steps. Your answers are used as context in every Delter AI conversation, and you can change them
            any time in Settings.
          </p>

          {/* Stepper */}
          <ol className="mt-6 flex items-center gap-2" aria-label={`Step ${step + 1} of ${steps.length}`}>
            {steps.map((label, index) => {
              const state = index < step ? "done" : index === step ? "current" : "todo";
              return (
                <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => index < step && setStep(index as Step)}
                    disabled={index > step}
                    aria-current={state === "current" ? "step" : undefined}
                    className="flex min-w-0 items-center gap-1.5 text-left disabled:cursor-default"
                  >
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold"
                      style={{
                        background: state === "todo" ? "transparent" : state === "done" ? "var(--success)" : "var(--accent)",
                        color: state === "todo" ? "var(--text-faint)" : "#fff",
                        border: state === "todo" ? "1px solid var(--border-strong)" : "none",
                      }}
                    >
                      {state === "done" ? <IconCheck size={11} /> : index + 1}
                    </span>
                    <span
                      className="hidden truncate text-[12px] sm:block"
                      style={{ color: state === "todo" ? "var(--text-faint)" : "var(--text)" }}
                    >
                      {label}
                    </span>
                  </button>
                  {index < steps.length - 1 ? (
                    <span className="h-px min-w-2 flex-1" style={{ background: "var(--border)" }} aria-hidden />
                  ) : null}
                </li>
              );
            })}
          </ol>

          {error ? (
            <p
              role="alert"
              className="mt-5 rounded-lg border px-3.5 py-2.5 text-[13px] font-medium"
              style={{ borderColor: "color-mix(in srgb, var(--danger) 38%, var(--border))", background: "var(--danger-soft)", color: "var(--danger)" }}
            >
              {error}
            </p>
          ) : null}

          <form onSubmit={finish} className="mt-6">
            {/* ---------------------------------------------------- step 1 */}
            {step === 0 ? (
              <section className="space-y-4">
                <Input
                  label="What should Delter AI call you?"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Your name or a display name"
                  maxLength={80}
                  autoFocus
                  autoComplete="nickname"
                  hint="Used in the workspace and in the assistant's context. Leave it as it is if that already looks right."
                  disabled={submitting}
                />

                <div className="rounded-lg border p-3.5" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
                  <p className="label-caps mb-1.5">How it will read</p>
                  <p className="text-[13px] leading-relaxed text-fg-secondary">
                    “{displayName.trim() || "there"}, here is what I found in your project…”
                  </p>
                </div>
              </section>
            ) : null}

            {/* ---------------------------------------------------- step 2 */}
            {step === 1 ? (
              <section className="space-y-3">
                <fieldset disabled={submitting}>
                  <legend className="label-caps mb-2.5">What will you mainly use Delter AI for?</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {PURPOSES.map((option) => {
                      const selected = purpose === option.label && !customPurpose.trim();
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            setPurpose(option.label);
                            setCustomPurpose("");
                          }}
                          aria-pressed={selected}
                          className="rounded-lg border p-3 text-left transition-colors"
                          style={{
                            borderColor: selected ? "var(--accent)" : "var(--border)",
                            background: selected ? "var(--accent-soft)" : "var(--surface)",
                          }}
                        >
                          <span className="block text-[13px] font-medium" style={{ color: selected ? "var(--accent-text)" : "var(--text)" }}>
                            {option.label}
                          </span>
                          <span className="mt-0.5 block text-[11.5px] leading-snug text-fg-muted">{option.note}</span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <Textarea
                  label="Or describe it yourself"
                  value={customPurpose}
                  onChange={(event) => setCustomPurpose(event.target.value)}
                  rows={2}
                  maxLength={200}
                  optional
                  placeholder="e.g. I maintain an internal reporting tool and write release notes"
                  disabled={submitting}
                  labelExtra={<span>{customPurpose.length}/200</span>}
                  hint="This replaces the option above when filled in, and is sent to the assistant as context."
                />
              </section>
            ) : null}

            {/* ---------------------------------------------------- step 3 */}
            {step === 2 ? (
              <section className="space-y-3">
                <div>
                  <p className="label-caps mb-2.5">Anything you work with often?</p>
                  <p className="mb-3 text-[12.5px] text-fg-muted">
                    Optional, up to 12. These bias how Delter AI explains things and what it assumes you know.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {INTERESTS.map((interest) => {
                      const selected = interests.includes(interest);
                      return (
                        <button
                          key={interest}
                          type="button"
                          onClick={() => toggleInterest(interest)}
                          disabled={submitting}
                          aria-pressed={selected}
                          className="rounded-full border px-2.5 py-1 text-[12px] transition-colors disabled:opacity-60"
                          style={{
                            borderColor: selected ? "var(--accent)" : "var(--border)",
                            background: selected ? "var(--accent-soft)" : "var(--surface)",
                            color: selected ? "var(--accent-text)" : "var(--text-secondary)",
                          }}
                        >
                          {interest}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {interests.length ? (
                  <p className="text-[12px] text-fg-muted">
                    {interests.length} selected{interests.length >= 12 ? " (limit reached)" : ""}
                  </p>
                ) : null}
              </section>
            ) : null}

            {/* ------------------------------------------------- controls */}
            <div className="mt-7 flex items-center gap-2">
              {step > 0 ? (
                <Button variant="ghost" onClick={() => setStep((current) => (current - 1) as Step)} disabled={submitting}>
                  Back
                </Button>
              ) : null}

              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => finish()}
                  disabled={submitting}
                  className="h-9 rounded-md px-3 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg disabled:opacity-60"
                >
                  Skip
                </button>

                {step < 2 ? (
                  <Button variant="primary" onClick={() => setStep((current) => (current + 1) as Step)} disabled={submitting}>
                    Continue
                    <IconArrowRight size={15} />
                  </Button>
                ) : (
                  <Button type="submit" variant="primary" loading={submitting} loadingLabel="Setting up…">
                    Enter workspace
                    <IconArrowRight size={15} />
                  </Button>
                )}
              </div>
            </div>
          </form>
        </div>

        <p className="mt-8 text-center text-[12px] text-fg-faint">
          Delter AI — a product of Delter Technologies
        </p>
      </div>
    </div>
  );
}
