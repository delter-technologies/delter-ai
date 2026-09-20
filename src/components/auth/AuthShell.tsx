import Link from "next/link";
import type { ReactNode } from "react";
import { IconLogo } from "@/components/ui/Icons";

/**
 * Shared shell for sign in, sign up and password recovery.
 *
 * Single column, no decorative background, and a clear line back to the other
 * auth routes. On mobile the card goes full-bleed so the form is comfortable to
 * use one-handed.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="border-b" style={{ borderColor: "var(--border)" }}>
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 text-fg" aria-label="Delter AI home">
            <span style={{ color: "var(--accent)" }}>
              <IconLogo size={20} />
            </span>
            <span className="text-[14.5px] font-semibold tracking-[-0.02em]">Delter AI</span>
          </Link>
          <span className="hidden text-[12px] text-fg-muted sm:block">A product of Delter Technologies</span>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:py-12">
        <div className={`w-full ${wide ? "max-w-lg" : "max-w-[26rem]"}`}>
          <h1 className="text-[24px] font-semibold tracking-[-0.025em] text-fg sm:text-[27px]">{title}</h1>
          {subtitle ? <div className="mt-2 text-[13.5px] leading-relaxed text-fg-secondary">{subtitle}</div> : null}

          <div className="mt-6">{children}</div>

          {footer ? <div className="mt-6 text-[13px] text-fg-muted">{footer}</div> : null}
        </div>
      </main>

      <footer className="border-t px-4 py-5 text-center text-[12px] text-fg-faint sm:px-6" style={{ borderColor: "var(--border)" }}>
        Delter AI · Delter Technologies
      </footer>
    </div>
  );
}
