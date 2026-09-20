"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * Dropdown menu.
 *
 * Used for row actions (rename/delete a project, download/delete a file) and the
 * account menu. Closes on outside click, Escape and selection; supports arrow
 * keys; anchored so it flips upward when there is no room below.
 */

export type MenuItem =
  | { type: "separator"; key: string }
  | { type: "label"; key: string; label: ReactNode }
  | {
      type?: "item";
      key: string;
      label: ReactNode;
      icon?: ReactNode;
      onSelect: () => void;
      tone?: "default" | "danger";
      disabled?: boolean;
      /** Shown right-aligned, e.g. a keyboard shortcut. */
      hint?: string;
    };

export type MenuTriggerProps = {
  open: boolean;
  toggle: () => void;
  ref: React.Ref<HTMLButtonElement>;
  describedBy?: string;
};

export type MenuTrigger = ReactNode | ((props: MenuTriggerProps) => ReactNode);

export function Menu({
  items,
  trigger,
  align = "end",
  ariaLabel = "Actions",
  width = 220,
}: {
  items: MenuItem[];
  /** Either a render function, or a node (e.g. from `MenuTriggerButton()`). */
  trigger: MenuTrigger;
  align?: "start" | "end";
  ariaLabel?: string;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [flipUp, setFlipUp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const selectable = items.filter((item) => item.type !== "separator" && item.type !== "label" && !item.disabled);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;

      event.preventDefault();
      const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []);
      if (!buttons.length) return;
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);

      let next = 0;
      if (event.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % buttons.length;
      else if (event.key === "ArrowUp") next = current < 0 ? buttons.length - 1 : (current - 1 + buttons.length) % buttons.length;
      else if (event.key === "End") next = buttons.length - 1;
      buttons[next]?.focus();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    // Decide placement once, when opening.
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setFlipUp(window.innerHeight - rect.bottom < 260 && rect.top > 260);

    const timer = setTimeout(() => {
      listRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();
    }, 0);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      clearTimeout(timer);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block">
      {typeof trigger === "function"
        ? trigger({
            open,
            toggle: () => setOpen((value) => !value),
            ref: triggerRef,
            describedBy: open ? menuId : undefined,
          })
        : trigger}

      {open ? (
        <div
          id={menuId}
          ref={listRef}
          role="menu"
          aria-label={ariaLabel}
          className={`absolute z-50 overflow-hidden rounded-lg border bg-surface-raised py-1 shadow-lg ${
            align === "end" ? "right-0" : "left-0"
          } ${flipUp ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"}`}
          style={{ borderColor: "var(--border)", width }}
        >
          {items.map((item) => {
            if (item.type === "separator") {
              return <div key={item.key} className="my-1 h-px" style={{ background: "var(--border)" }} role="separator" />;
            }
            if (item.type === "label") {
              return (
                <p key={item.key} className="label-caps px-3 py-1.5">
                  {item.label}
                </p>
              );
            }
            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  // Let the menu close before running the action, so a modal it
                  // opens is not competing for focus with a closing element.
                  setTimeout(() => item.onSelect(), 0);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-[7px] text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                style={{
                  color: item.tone === "danger" ? "var(--danger)" : "var(--text)",
                }}
                onMouseEnter={(event) => (event.currentTarget.style.background = "var(--bg-muted)")}
                onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
              >
                {item.icon ? <span className="shrink-0 opacity-80">{item.icon}</span> : null}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.hint ? <span className="shrink-0 text-[11px] text-fg-faint">{item.hint}</span> : null}
              </button>
            );
          })}
          {selectable.length === 0 ? (
            <p className="px-3 py-2 text-[12.5px] text-fg-muted">No actions available.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The standard "…" trigger used across list rows.
 * Returns a render function, so pass it straight to `<Menu trigger={…} />`.
 */
export function MenuTriggerButton(label = "Open actions menu") {
  return function Trigger({ open, toggle, ref }: MenuTriggerProps) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
        style={open ? { background: "var(--bg-muted)", color: "var(--text)" } : undefined}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <circle cx="8" cy="3.25" r="1.35" />
          <circle cx="8" cy="8" r="1.35" />
          <circle cx="8" cy="12.75" r="1.35" />
        </svg>
      </button>
    );
  };
}
