"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/States";
import { IconChart, IconLock, IconSparkle, IconUser } from "@/components/ui/Icons";
import { ProfileTab } from "./tabs/ProfileTab";
import { AppearanceAiTab } from "./tabs/AppearanceAiTab";
import { SecurityTab } from "./tabs/SecurityTab";
import { UsageTab } from "./tabs/UsageTab";
import { AccountTab } from "./tabs/AccountTab";

/**
 * Settings.
 *
 * Five tabs over data that already exists on the server: the profile row, the
 * AI configuration, live sessions, recorded usage and the account record. Each
 * tab writes through a real endpoint and reports the server's own message on
 * failure — nothing here is decorative.
 */

export type SettingsUser = {
  id: string;
  email: string;
  name: string;
  displayName: string | null;
  emailVerified: boolean;
  mainPurpose: string | null;
  interests: string[];
  theme: "system" | "light" | "dark";
  defaultModel: string | null;
  memberSince: string;
  onboardedAt: string | null;
};

export type SettingsSession = {
  id: string;
  current: boolean;
  device: string;
  userAgent: string | null;
  remember: boolean;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

export type SettingsUsage = {
  days: number;
  ai: {
    requests: number;
    failedRequests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    byModel: { model: string; provider: string | null; requests: number; totalTokens: number }[];
    byDay: { date: string; requests: number; totalTokens: number }[];
  };
  storage: {
    /** Where uploaded bytes actually live, in the driver's own words. */
    backend: string;
    uploads: number;
    bytesOnDisk: number;
    bytesRecorded: number;
    fileCount: number;
    codeFileCount: number;
  };
  workspace: { projectCount: number; conversationCount: number };
  images: { generations: number };
  billing: { enabled: boolean; note: string };
};

export type SettingsData = {
  user: SettingsUser;
  delterAccount: { linked: true; id: string } | { linked: false; note: string };
  providers: { id: string; label: string; configured: boolean; reason: string | null }[];
  models: {
    id: string;
    label: string;
    provider: string;
    providerLabel: string;
    available: boolean;
    description: string | null;
  }[];
  activeModel: { id: string; label: string; providerLabel: string };
  demoMode: boolean;
  resetEmailConfigured: boolean;
  sessions: SettingsSession[];
  usage: SettingsUsage;
  limits: { maxUploadMb: number };
};

type TabId = "profile" | "ai" | "security" | "usage" | "account";

const TABS: { id: TabId; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: "profile", label: "Profile", icon: <IconUser size={15} />, hint: "Name and what you use Delter AI for" },
  { id: "ai", label: "Appearance & AI", icon: <IconSparkle size={15} />, hint: "Theme, default model, providers" },
  { id: "security", label: "Security", icon: <IconLock size={15} />, hint: "Password and signed-in devices" },
  { id: "usage", label: "Usage", icon: <IconChart size={15} />, hint: "Real requests, tokens and storage" },
  { id: "account", label: "Account", icon: <IconUser size={15} />, hint: "Account record and data" },
];

export function SettingsView({ data }: { data: SettingsData }) {
  const [tab, setTab] = useState<TabId>("profile");
  const [user, setUser] = useState(data.user);
  const [sessions, setSessions] = useState(data.sessions);
  const [usage, setUsage] = useState(data.usage);
  const [activeModel, setActiveModel] = useState(data.activeModel);
  const [demoMode, setDemoMode] = useState(data.demoMode);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-7">
      <header className="mb-5">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em]">Settings</h1>
        <p className="mt-1 text-[13px] text-fg-muted">
          Signed in as <span className="text-fg-secondary">{user.email}</span>
          {demoMode ? (
            <Badge tone="warning" className="ml-2" title="No AI provider key is configured on this server">
              demo mode
            </Badge>
          ) : (
            <Badge tone="success" className="ml-2" title={activeModel.providerLabel}>
              {activeModel.label}
            </Badge>
          )}
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[210px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="lg:sticky lg:top-4 lg:self-start">
          <ul className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:pb-0">
            {TABS.map((entry) => {
              const active = entry.id === tab;
              return (
                <li key={entry.id} className="shrink-0 lg:shrink">
                  <button
                    type="button"
                    onClick={() => setTab(entry.id)}
                    aria-current={active ? "true" : undefined}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
                      active ? "bg-bg-muted font-medium text-fg" : "text-fg-secondary hover:bg-bg-subtle"
                    }`}
                  >
                    <span className={active ? "text-accent-text" : "text-fg-faint"}>{entry.icon}</span>
                    <span className="whitespace-nowrap">{entry.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 hidden px-3 text-[11.5px] leading-relaxed text-fg-faint lg:block">
            {TABS.find((entry) => entry.id === tab)?.hint}
          </p>
        </nav>

        <div className="min-w-0">
          {tab === "profile" && <ProfileTab user={user} onSaved={setUser} />}

          {tab === "ai" && (
            <AppearanceAiTab
              user={user}
              onUserChanged={setUser}
              providers={data.providers}
              models={data.models}
              activeModel={activeModel}
              onActiveModelChanged={(model, demo) => {
                setActiveModel(model);
                setDemoMode(demo);
              }}
              demoMode={demoMode}
            />
          )}

          {tab === "security" && (
            <SecurityTab
              sessions={sessions}
              onSessionsChanged={setSessions}
              resetEmailConfigured={data.resetEmailConfigured}
            />
          )}

          {tab === "usage" && <UsageTab usage={usage} onUsageChanged={setUsage} limits={data.limits} />}

          {tab === "account" && (
            <AccountTab user={user} delterAccount={data.delterAccount} usage={usage} sessions={sessions} />
          )}
        </div>
      </div>
    </div>
  );
}
