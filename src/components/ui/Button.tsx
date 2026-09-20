"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

/**
 * Button.
 *
 * One component for every action in the product so states stay consistent:
 * `loading` disables and shows a spinner, `disabled` is visually distinct, and
 * the danger variant is reserved for destructive operations. Touch targets stay
 * at least 36px tall on small screens.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
export type ButtonSize = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Text shown while loading, replacing the label. */
  loadingLabel?: string;
  icon?: ReactNode;
  iconRight?: ReactNode;
  block?: boolean;
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-[12.5px] gap-1.5 rounded-md",
  md: "h-9 px-3.5 text-[13px] gap-2 rounded-md",
  lg: "h-11 px-5 text-[14px] gap-2 rounded-lg",
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "text-white shadow-sm hover:opacity-[0.92] active:opacity-100",
  secondary: "border bg-surface text-fg hover:bg-bg-muted active:bg-bg-subtle",
  ghost: "text-fg-secondary hover:bg-bg-muted hover:text-fg",
  danger: "text-white shadow-sm hover:opacity-[0.92] active:opacity-100",
  quiet: "border border-transparent text-fg-muted hover:text-fg hover:bg-bg-muted",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    loadingLabel,
    icon,
    iconRight,
    block = false,
    className = "",
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;

  const inlineStyle: Record<string, string> = {};
  if (variant === "primary") inlineStyle.background = "var(--accent)";
  if (variant === "danger") inlineStyle.background = "var(--danger)";
  if (variant === "secondary") inlineStyle.borderColor = "var(--border)";

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        "relative inline-flex select-none items-center justify-center font-medium whitespace-nowrap",
        "transition-[background-color,color,opacity,border-color] duration-100",
        "disabled:cursor-not-allowed disabled:opacity-50",
        SIZES[size],
        VARIANTS[variant],
        block ? "w-full" : "",
        className,
      ].join(" ")}
      style={inlineStyle}
      {...rest}
    >
      {loading ? <Spinner className={size === "lg" ? "h-4 w-4" : "h-3.5 w-3.5"} /> : icon}
      <span className={loading && !loadingLabel ? "sr-only" : undefined}>{loading ? (loadingLabel ?? children) : children}</span>
      {!loading && iconRight}
    </button>
  );
});

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.22" strokeWidth="2" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export type { Props as ButtonProps };
