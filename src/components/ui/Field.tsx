"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

/**
 * Form fields.
 *
 * Label, control, hint and error are wired together with real `aria-*`
 * attributes so the forms are usable with a keyboard and a screen reader, and so
 * validation messages are announced rather than only seen.
 */

type SharedProps = {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
  /** Rendered to the right of the label, e.g. a character counter. */
  labelExtra?: ReactNode;
  optional?: boolean;
};

function FieldShell({
  id,
  label,
  hint,
  error,
  labelExtra,
  optional,
  children,
}: SharedProps & { id: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      {label ? (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <label htmlFor={id} className="text-[12.5px] font-medium text-fg-secondary">
            {label}
            {optional ? <span className="ml-1.5 text-[11.5px] font-normal text-fg-faint">optional</span> : null}
          </label>
          {labelExtra ? <span className="shrink-0 text-[11.5px] text-fg-faint">{labelExtra}</span> : null}
        </div>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-snug" style={{ color: "var(--danger)" }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="mt-[2px] shrink-0" aria-hidden>
            <circle cx="8" cy="8" r="6.25" />
            <path d="M8 5v3.5" strokeLinecap="round" />
            <path d="M8 10.75h.01" strokeLinecap="round" />
          </svg>
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[12px] leading-snug text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL_BASE =
  "w-full rounded-md border bg-bg text-fg placeholder:text-fg-faint transition-colors " +
  "focus:outline-none focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_28%,transparent)] " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & SharedProps>(
  function Input({ label, hint, error, labelExtra, optional, className = "", id, ...rest }, ref) {
    const generatedId = useId();
    const controlId = id ?? generatedId;
    return (
      <FieldShell id={controlId} label={label} hint={hint} error={error} labelExtra={labelExtra} optional={optional}>
        <input
          ref={ref}
          id={controlId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${controlId}-error` : hint ? `${controlId}-hint` : undefined}
          className={`${CONTROL_BASE} h-9 px-3 text-[13.5px] ${className}`}
          style={{ borderColor: error ? "var(--danger)" : "var(--border)" }}
          {...rest}
        />
      </FieldShell>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & SharedProps>(
  function Textarea({ label, hint, error, labelExtra, optional, className = "", id, ...rest }, ref) {
    const generatedId = useId();
    const controlId = id ?? generatedId;
    return (
      <FieldShell id={controlId} label={label} hint={hint} error={error} labelExtra={labelExtra} optional={optional}>
        <textarea
          ref={ref}
          id={controlId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${controlId}-error` : hint ? `${controlId}-hint` : undefined}
          className={`${CONTROL_BASE} px-3 py-2 text-[13.5px] leading-relaxed ${className}`}
          style={{ borderColor: error ? "var(--danger)" : "var(--border)" }}
          {...rest}
        />
      </FieldShell>
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & SharedProps>(
  function Select({ label, hint, error, labelExtra, optional, className = "", id, children, ...rest }, ref) {
    const generatedId = useId();
    const controlId = id ?? generatedId;
    return (
      <FieldShell id={controlId} label={label} hint={hint} error={error} labelExtra={labelExtra} optional={optional}>
        <div className="relative">
          <select
            ref={ref}
            id={controlId}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${controlId}-error` : hint ? `${controlId}-hint` : undefined}
            className={`${CONTROL_BASE} h-9 appearance-none pl-3 pr-8 text-[13.5px] ${className}`}
            style={{ borderColor: error ? "var(--danger)" : "var(--border)" }}
            {...rest}
          >
            {children}
          </select>
          <svg
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-muted"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M2.5 4.5 6 8l3.5-3.5" />
          </svg>
        </div>
      </FieldShell>
    );
  },
);

export function Checkbox({
  label,
  description,
  className = "",
  id,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  return (
    <div className={`flex items-start gap-2.5 ${className}`}>
      <input
        id={controlId}
        type="checkbox"
        className="mt-[3px] h-4 w-4 shrink-0 cursor-pointer rounded border accent-[var(--accent)]"
        style={{ borderColor: "var(--border-strong)" }}
        {...rest}
      />
      <label htmlFor={controlId} className="cursor-pointer select-none text-[13px] leading-snug text-fg-secondary">
        {label}
        {description ? <span className="mt-0.5 block text-[12px] text-fg-muted">{description}</span> : null}
      </label>
    </div>
  );
}
