"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/States";
import { IconClose, IconFiles, IconSend, IconStop } from "@/components/ui/Icons";
import type { AttachedFile } from "./useChatSession";

/**
 * Chat composer.
 *
 * A growing textarea with real keyboard behaviour: Enter sends, Shift+Enter makes
 * a new line, Escape blurs. On touch devices Enter makes a newline instead, since
 * a phone keyboard's Enter is a line break and reaching for a Send button is
 * expected.
 *
 * Attachments are shown as removable chips so it is always visible exactly which
 * files are being sent as context — nothing is attached silently.
 */
export function Composer({
  onSend,
  onStop,
  isStreaming,
  disabled,
  placeholder,
  attached,
  onDetach,
  onPickFiles,
  modelLabel,
  demoMode,
  projectName,
}: {
  onSend: (content: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  placeholder?: string;
  attached: AttachedFile[];
  onDetach: (fileId: string) => void;
  onPickFiles: () => void;
  modelLabel?: string | null;
  demoMode?: boolean;
  projectName?: string | null;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [touchInput, setTouchInput] = useState(false);

  // Detect a coarse pointer once; controls Enter behaviour.
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) {
      setTouchInput(true);
    }
  }, []);

  // Auto-grow up to a sensible maximum, then let it scroll.
  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    const next = Math.min(element.scrollHeight, 220);
    element.style.height = `${Math.max(44, next)}px`;
  }, [value]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming || disabled) return;
    onSend(trimmed);
    setValue("");
    // Reset the height after clearing.
    requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.style.height = "44px";
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      if (touchInput) return; // newline on touch
      event.preventDefault();
      submit();
    }
    if (event.key === "Escape") {
      event.currentTarget.blur();
    }
  };

  return (
    <div className="shrink-0 border-t bg-bg" style={{ borderColor: "var(--border)" }}>
      <div className="mx-auto w-full max-w-3xl px-3 py-2.5 sm:px-5 sm:py-3">
        {attached.length ? (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="label-caps mr-0.5">Context</span>
            {attached.map((file) => (
              <span
                key={file.id}
                className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border py-[2px] pl-2 pr-1 text-[11.5px]"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--bg-subtle)",
                  color: "var(--text-secondary)",
                }}
                title={
                  file.extractable
                    ? `${file.name} — its text will be sent as context`
                    : `${file.name} — ${file.mimeType} is not readable as text, so only its name and type are sent`
                }
              >
                <IconFiles size={11} className="shrink-0" />
                <span className="truncate">{file.name}</span>
                {!file.extractable ? <Badge tone="warning">not readable</Badge> : null}
                <button
                  type="button"
                  onClick={() => onDetach(file.id)}
                  aria-label={`Remove ${file.name} from context`}
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-fg-faint transition-colors hover:bg-bg-muted hover:text-fg"
                >
                  <IconClose size={9} />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div
          className="rounded-lg border bg-surface transition-colors focus-within:border-[var(--accent)]"
          style={{ borderColor: "var(--border)" }}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            disabled={disabled}
            placeholder={placeholder ?? (projectName ? `Ask about ${projectName}…` : "Ask Delter AI anything…")}
            aria-label="Message Delter AI"
            className="block w-full resize-none bg-transparent px-3 py-2.5 text-[13.5px] leading-relaxed text-fg placeholder:text-fg-faint focus:outline-none disabled:opacity-60"
            style={{ minHeight: 44, maxHeight: 220 }}
          />

          <div className="flex items-center gap-1.5 px-2 pb-2">
            <button
              type="button"
              onClick={onPickFiles}
              disabled={disabled}
              aria-label="Attach files as context"
              title="Attach files as context"
              className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg disabled:opacity-40"
            >
              <IconFiles size={15} />
            </button>

            <div className="ml-auto flex min-w-0 items-center gap-2">
              {demoMode ? (
                <Badge tone="warning" title="No AI provider key is configured, so the offline demo provider answers.">
                  Demo mode
                </Badge>
              ) : modelLabel ? (
                <span className="hidden max-w-[14ch] truncate text-[11px] text-fg-faint sm:block" title={modelLabel}>
                  {modelLabel}
                </span>
              ) : null}

              {isStreaming ? (
                <Button size="sm" variant="secondary" onClick={onStop} icon={<IconStop size={11} />}>
                  Stop
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={submit}
                  disabled={!value.trim() || disabled}
                  icon={<IconSend size={13} />}
                  aria-label="Send message"
                >
                  Send
                </Button>
              )}
            </div>
          </div>
        </div>

        <p className="mt-1.5 px-1 text-[11px] text-fg-faint">
          {touchInput ? "Tap Send to submit · new line with Enter" : "Enter to send · Shift+Enter for a new line"}
          {projectName ? ` · answering with “${projectName}” in context` : ""}
        </p>
      </div>
    </div>
  );
}
