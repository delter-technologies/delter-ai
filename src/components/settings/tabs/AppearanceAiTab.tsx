"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/States";
import { IconCheck, IconMoon, IconSun } from "@/components/ui/Icons";
import { useToast } from "@/components/system/ToastProvider";
import { useTheme } from "@/components/system/ThemeProvider";
import { api, errorMessage } from "@/lib/client/api";
import { Note, Row, Section } from "../parts";
import type { SettingsData, SettingsUser } from "../SettingsView";

/**
 * Appearance and AI.
 *
 * Theme is stored on the user row (so it follows you between devices) and
 * applied locally at the same time. The default model is validated against the
 * registry by the server; models whose provider has no key are still selectable
 * and are marked as such, because a key can be added later — the request layer
 * falls back and says so when it does.
 */

type Theme = "system" | "light" | "dark";

type ProviderTestResponse = {
  ok: boolean;
  demo: boolean;
  configured: boolean;
  modelLabel: string | null;
  latencyMs: number;
  reply?: string;
  message?: string;
  /** Extra context when the connection worked but the reply did not (reasoning-only models). */
  note?: string;
};

type ProviderTest = { state: "testing" } | { state: "done"; ok: boolean; detail: string };

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

const THEME_OPTIONS: { id: Theme; label: string; icon: React.ReactNode }[] = [
  { id: "system", label: "System", icon: <IconCheck size={14} /> },
  { id: "light", label: "Light", icon: <IconSun size={14} /> },
  { id: "dark", label: "Dark", icon: <IconMoon size={14} /> },
];

export function AppearanceAiTab({
  user,
  onUserChanged,
  providers,
  models,
  activeModel,
  onActiveModelChanged,
  demoMode,
}: {
  user: SettingsUser;
  onUserChanged: (user: SettingsUser) => void;
  providers: SettingsData["providers"];
  models: SettingsData["models"];
  activeModel: SettingsData["activeModel"];
  onActiveModelChanged: (model: SettingsData["activeModel"], demoMode: boolean) => void;
  demoMode: boolean;
}) {
  const toast = useToast();
  const { theme, resolved, setTheme } = useTheme();

  /**
   * Provider connection tests.
   *
   * `configured` only proves a key exists in the server environment. This runs
   * one real, tiny request so the row can say whether the provider actually
   * answers — and repeat the provider's own reason when it does not (an empty
   * credit balance reads very differently from a bad key).
   */
  const [tests, setTests] = useState<Record<string, ProviderTest>>({});
  // One test at a time: they all spend real credit on the user's keys.
  const anyTesting = Object.values(tests).some((entry) => entry.state === "testing");

  async function runProviderTest(providerId: string, providerLabel: string) {
    setTests((prev) => ({ ...prev, [providerId]: { state: "testing" } }));
    try {
      const result = await api.post<ProviderTestResponse>(`/api/ai/providers/${providerId}/test`);
      setTests((prev) => ({
        ...prev,
        [providerId]: {
          state: "done",
          ok: result.ok,
          detail: result.ok
            ? result.demo
              ? `The offline demo responder answered in ${result.latencyMs} ms. It is a deterministic local responder, not a language model.`
              : result.note
                ? `${result.modelLabel ?? "Its model"}: ${result.note}`
                : `${result.modelLabel ?? "Its cheapest chat model"} answered in ${result.latencyMs} ms${
                    result.reply ? ` with “${truncate(result.reply, 60)}”` : ""
                  }.`
            : (result.message ?? `${providerLabel} did not respond.`),
        },
      }));
    } catch (error) {
      setTests((prev) => ({
        ...prev,
        [providerId]: { state: "done", ok: false, detail: errorMessage(error) },
      }));
    }
  }

  // The server value wins on first paint; the provider keeps the applied value.
  const [selectedTheme, setSelectedTheme] = useState<Theme>(theme ?? user.theme);
  const [themeBusy, setThemeBusy] = useState(false);
  const [selectedModel, setSelectedModel] = useState(user.defaultModel ?? activeModel.id);
  const [modelBusy, setModelBusy] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof models>();
    for (const model of models) {
      const list = map.get(model.providerLabel) ?? [];
      list.push(model);
      map.set(model.providerLabel, list);
    }
    return [...map.entries()];
  }, [models]);

  async function chooseTheme(next: Theme) {
    if (next === selectedTheme || themeBusy) return;
    const previous = selectedTheme;
    setSelectedTheme(next);
    setTheme(next); // applies immediately, and survives a reload on this device
    setThemeBusy(true);
    try {
      await api.patch("/api/user/preferences", { theme: next });
      onUserChanged({ ...user, theme: next });
      toast.success("Theme updated", next === "system" ? "Delter AI will follow your device setting." : `${next} theme saved to your account.`);
    } catch (error) {
      setSelectedTheme(previous);
      setTheme(previous);
      toast.error("Could not save your theme", errorMessage(error, "Please try again."));
    } finally {
      setThemeBusy(false);
    }
  }

  async function chooseModel(nextId: string) {
    if (nextId === selectedModel || modelBusy) return;
    const previous = selectedModel;
    setSelectedModel(nextId);
    setModelBusy(true);
    try {
      await api.patch("/api/user/preferences", { defaultModel: nextId });
      const chosen = models.find((model) => model.id === nextId);
      onUserChanged({ ...user, defaultModel: nextId });
      if (chosen) {
        onActiveModelChanged(
          { id: chosen.id, label: chosen.label, providerLabel: chosen.providerLabel },
          chosen.provider === "delter-demo",
        );
      }
      toast.success(
        "Default model updated",
        chosen?.available
          ? `New conversations will use ${chosen.label}.`
          : `${chosen?.label ?? "That model"} has no provider key configured yet, so Delter AI will fall back and tell you when it does.`,
      );
    } catch (error) {
      setSelectedModel(previous);
      toast.error("Could not save your default model", errorMessage(error, "Please try again."));
    } finally {
      setModelBusy(false);
    }
  }

  const unconfigured = providers.filter((provider) => !provider.configured);

  return (
    <div className="space-y-5">
      <Section title="Appearance" description="Applied to this workspace immediately and saved to your account.">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-bg-subtle p-1" role="group" aria-label="Theme">
            {THEME_OPTIONS.map((option) => {
              const active = option.id === selectedTheme;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => void chooseTheme(option.id)}
                  disabled={themeBusy}
                  aria-pressed={active}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] transition-colors disabled:opacity-60 ${
                    active ? "bg-surface font-medium text-fg shadow-sm" : "text-fg-muted hover:text-fg"
                  }`}
                >
                  {option.id === "system" ? null : option.icon}
                  {option.label}
                </button>
              );
            })}
          </div>
          <span className="text-[12px] text-fg-muted">
            Currently rendering in {resolved} mode{selectedTheme === "system" ? " (from your device setting)" : ""}.
          </span>
        </div>
      </Section>

      <Section
        title="Default model"
        description="Used for new conversations unless you pick another model in the composer. Existing conversations keep the model they were started with."
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[260px] flex-1">
            <span className="mb-1.5 block text-[12.5px] font-medium text-fg-secondary">Model</span>
            <select
              value={selectedModel}
              onChange={(event) => void chooseModel(event.target.value)}
              disabled={modelBusy}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-[13px] text-fg outline-none focus:border-accent disabled:opacity-60"
            >
              {grouped.map(([providerLabel, list]) => (
                <optgroup key={providerLabel} label={providerLabel}>
                  {list.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                      {model.available ? "" : " — no key configured"}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="text-[12px] text-fg-muted">
            <p>
              In use now: <span className="text-fg-secondary">{activeModel.label}</span> ({activeModel.providerLabel})
            </p>
            {modelBusy ? <p>Saving…</p> : null}
          </div>
        </div>

        <div className="mt-4">
          <Note tone={demoMode ? "warning" : "info"}>
            {demoMode
              ? "No AI provider key is configured on this server, so replies come from Delter AI's offline demo provider. It is a deterministic responder, not a language model: it will not reason, write prose or generate code. Add a key to the server .env file and restart to switch to live models."
              : `A live provider is configured. Requests go to ${activeModel.providerLabel} with your conversation content; nothing else about your account is sent.`}
          </Note>
        </div>
      </Section>

      <Section
        title="Providers"
        description="Read from the server environment at request time. Keys are never sent to the browser — only whether one is present. A key being present does not prove the account works, so Test sends one real request of a few tokens and reports what the provider actually said."
      >
        <ul className="m-0 space-y-2 p-0">
          {providers.map((provider) => {
            const providerModels = models.filter((model) => model.provider === provider.id);
            const test = tests[provider.id];
            return (
              <li
                key={provider.id}
                className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-lg border border-border bg-bg-subtle px-3 py-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium">{provider.label}</span>
                    <Badge tone={provider.configured ? "success" : "neutral"} dot>
                      {provider.configured ? "key present" : "no key"}
                    </Badge>
                  </span>
                  <span className="mt-0.5 block text-[12px] text-fg-muted">
                    {provider.reason ?? `${providerModels.length} model${providerModels.length === 1 ? "" : "s"} available from this provider.`}
                  </span>
                  {test ? (
                    <span
                      role="status"
                      aria-live="polite"
                      className={`mt-2 block rounded-md border px-2.5 py-2 text-[12px] leading-relaxed ${
                        test.state === "done" && test.ok
                          ? "border-success/40 bg-success-soft"
                          : "border-danger/40 bg-danger-soft"
                      }`}
                    >
                      {test.state === "testing" ? (
                        <span className="text-fg-secondary">Sending one small request to {provider.label}…</span>
                      ) : (
                        <>
                          <span className={`font-medium ${test.ok ? "text-success" : "text-danger"}`}>
                            {test.ok ? "Connected" : "Not reachable"}
                          </span>
                          <span className="text-fg-secondary"> — {test.detail}</span>
                        </>
                      )}
                    </span>
                  ) : null}
                </span>
                <Button
                  size="sm"
                  variant="quiet"
                  loading={test?.state === "testing"}
                  loadingLabel="Testing"
                  disabled={anyTesting}
                  onClick={() => runProviderTest(provider.id, provider.label)}
                >
                  Test
                </Button>
              </li>
            );
          })}
        </ul>

        {unconfigured.length ? (
          <div className="mt-4">
            <Note>
              To enable live models, add one of these to the server <code className="font-mono">.env</code> file and
              restart:{" "}
              {unconfigured
                .map((provider) => provider.reason?.match(/[A-Z_]{6,}/)?.[0])
                .filter(Boolean)
                .join(", ")}
              . Each provider's own reason is listed above.
            </Note>
          </div>
        ) : null}

        <dl className="m-0 mt-4">
          <Row label="Where keys live">
            Server environment only. The browser receives model ids and labels, never a credential.
          </Row>
          <Row label="Fallback order">
            Your default model first. If its provider has no key or the request fails, Delter AI falls back and shows a
            warning naming the model actually used.
          </Row>
        </dl>
      </Section>
    </div>
  );
}
