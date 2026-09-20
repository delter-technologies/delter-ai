"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/ui/Markdown";
import { Button } from "@/components/ui/Button";
import { Badge, ErrorState } from "@/components/ui/States";
import { IconCopy, IconRetry, IconStop, IconUser } from "@/components/ui/Icons";
import { formatDuration, formatNumber, relativeTime } from "@/lib/client/format";
import type { ChatMessage } from "./useChatSession";

/**
 * Message list.
 *
 * Renders persisted history and the in-flight response from the same array, so
 * there is no separate "streaming view" that could disagree with what is saved.
 * Auto-scroll follows the output while you are at the bottom and stops the moment
 * you scroll up, so reading an earlier answer is never interrupted.
 */
export function MessageList({
  messages,
  isStreaming,
  demoMode,
  onRetry,
  onStop,
  onCopy,
}: {
  messages: ChatMessage[];
  isStreaming: boolean;
  demoMode: boolean;
  onRetry: (messageId: string) => void;
  onStop: () => void;
  onCopy: (text: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);

  const onScroll = () => {
    const element = containerRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    setPinnedToBottom(distance < 80);
  };

  useEffect(() => {
    if (!pinnedToBottom) return;
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
  }, [messages, pinnedToBottom]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={containerRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        role="log"
        aria-live="polite"
        aria-label="Conversation"
      >
        <div className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-5">
          <ol className="space-y-5">
            {messages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                isStreaming={isStreaming}
                demoMode={demoMode}
                onRetry={onRetry}
                onStop={onStop}
                onCopy={onCopy}
              />
            ))}
          </ol>
          <div ref={bottomRef} aria-hidden />
        </div>
      </div>

      {!pinnedToBottom && isStreaming ? (
        <button
          type="button"
          onClick={() => bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" })}
          className="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border bg-surface-raised px-3 py-1.5 text-[12px] font-medium text-fg-secondary shadow-md transition-colors hover:text-fg"
          style={{ borderColor: "var(--border)" }}
        >
          Jump to latest
        </button>
      ) : null}
    </div>
  );
}

const MessageRow = memo(function MessageRow({
  message,
  isStreaming,
  demoMode,
  onRetry,
  onStop,
  onCopy,
}: {
  message: ChatMessage;
  isStreaming: boolean;
  demoMode: boolean;
  onRetry: (messageId: string) => void;
  onStop: () => void;
  onCopy: (text: string) => void;
}) {
  const isUser = message.role === "user";
  const isLive = message.pending || (isStreaming && message.role === "assistant" && !message.content);
  const [copied, setCopied] = useState(false);

  if (isUser) {
    return (
      <li className="flex justify-end gap-2.5">
        <div className="flex min-w-0 max-w-[85%] flex-col items-end sm:max-w-[75%]">
          <div
            className="rounded-lg rounded-br-sm px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words"
            style={{ background: "var(--accent-soft)", color: "var(--text)" }}
          >
            {message.content}
          </div>
          <span className="mt-1 px-1 text-[11px] text-fg-faint">{relativeTime(message.createdAt)}</span>
        </div>
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
          style={{ background: "var(--bg-muted)", color: "var(--text-muted)" }}
          aria-hidden
        >
          <IconUser size={14} />
        </span>
      </li>
    );
  }

  return (
    <li className="flex gap-2.5">
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
        style={{ background: "var(--bg-muted)", color: "var(--text-muted)" }}
        aria-hidden
      >
        <DelterMark />
      </span>

      <div className="min-w-0 flex-1">
        {message.content ? (
          <Markdown source={message.content} streaming={isLive} />
        ) : isLive ? (
          <ThinkingIndicator />
        ) : null}

        {/* A response that failed after producing some text keeps that text and
            shows the failure underneath it — never silently truncated. */}
        {message.error ? (
          <div className="mt-2.5">
            <ErrorState
              compact
              title={message.content ? "Response failed part way through" : "Unable to generate the response"}
              message={message.error}
              onRetry={() => onRetry(message.id)}
              retrying={isStreaming}
            />
          </div>
        ) : null}

        {!isLive && !message.error ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {message.model ? (
              <Badge tone={demoMode && message.provider === "delter-demo" ? "warning" : "neutral"} title={`Answered by ${message.provider ?? "unknown provider"} · ${message.model}`}>
                {message.provider === "delter-demo" ? "Demo mode" : message.model}
              </Badge>
            ) : null}
            {message.totalTokens ? (
              <span className="text-[11px] text-fg-faint" title="Tokens reported by the provider">
                {formatNumber(message.totalTokens)} tokens
              </span>
            ) : null}
            {message.durationMs ? (
              <span className="text-[11px] text-fg-faint">{formatDuration(message.durationMs)}</span>
            ) : null}

            <span className="ml-auto flex items-center gap-0.5">
              {message.content ? (
                <button
                  type="button"
                  onClick={() => {
                    onCopy(message.content);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  }}
                  className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
                  aria-label={copied ? "Copied" : "Copy response"}
                >
                  {copied ? "Copied" : <IconCopy size={12} />}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onRetry(message.id)}
                disabled={isStreaming}
                className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg disabled:opacity-40"
                aria-label="Regenerate this response"
              >
                <IconRetry size={12} />
                Regenerate
              </button>
            </span>
          </div>
        ) : null}

        {isStreaming && message.pending && message.content ? (
          <div className="mt-2">
            <Button size="sm" variant="secondary" onClick={onStop} icon={<IconStop size={11} />}>
              Stop
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
});

function DelterMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M5.4 11.6V4.4h2.15c1.95 0 3.5 1.4 3.5 3.6s-1.55 3.6-3.5 3.6H5.4Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 py-1" role="status" aria-label="Delter AI is generating a response">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: "var(--text-faint)",
              animation: `delter-pulse 1.1s ease-in-out ${index * 0.15}s infinite`,
            }}
          />
        ))}
      </span>
      <span className="text-[12.5px] text-fg-muted">Thinking…</span>
      <style>{`@keyframes delter-pulse { 0%,100% { opacity:.25 } 50% { opacity:1 } }`}</style>
    </div>
  );
}
