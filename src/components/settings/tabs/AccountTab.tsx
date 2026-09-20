"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/States";
import { useToast } from "@/components/system/ToastProvider";
import { api, errorMessage } from "@/lib/client/api";
import { formatBytes, formatDateTime, formatNumber } from "@/lib/client/format";
import { Note, Row, Section } from "../parts";
import type { SettingsData, SettingsSession, SettingsUsage, SettingsUser } from "../SettingsView";

/**
 * Account.
 *
 * The account record as it actually is, including the things that do not exist
 * yet: there is no linked Delter Account, no email verification service and no
 * self-service account deletion in this build. Each is stated plainly rather
 * than represented by a control that cannot do anything.
 */
export function AccountTab({
  user,
  delterAccount,
  usage,
  sessions,
}: {
  user: SettingsUser;
  delterAccount: SettingsData["delterAccount"];
  usage: SettingsUsage;
  sessions: SettingsSession[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await api.post("/api/auth/signout");
      router.refresh();
      router.replace("/");
    } catch (error) {
      setSigningOut(false);
      toast.error("Could not sign you out", errorMessage(error));
    }
  }

  return (
    <div className="space-y-5">
      <Section title="Account record" description="The row this workspace authenticates against.">
        <dl className="m-0">
          <Row label="Account id">
            <span className="font-mono text-[12px] text-fg-secondary">{user.id}</span>
          </Row>
          <Row label="Email">{user.email}</Row>
          <Row label="Name">
            {user.name}
            {user.displayName ? <span className="text-fg-muted"> · displayed as {user.displayName}</span> : null}
          </Row>
          <Row label="Member since">{formatDateTime(user.memberSince)}</Row>
          <Row label="Onboarding">
            {user.onboardedAt ? `Completed ${formatDateTime(user.onboardedAt)}` : "Not completed"}
          </Row>
          <Row label="Theme preference">
            {user.theme}
            <span className="text-fg-muted"> · stored on your account and applied on every device</span>
          </Row>
          <Row label="Password">
            Stored as a bcrypt hash (cost 12) on this server. Delter AI cannot read it back, and there is no
            third-party login in this build.
          </Row>
        </dl>
      </Section>

      <Section title="Delter Account" description="One account across Delter products.">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={delterAccount.linked ? "success" : "neutral"} dot>
            {delterAccount.linked ? "linked" : "not linked"}
          </Badge>
          {delterAccount.linked ? (
            <span className="font-mono text-[12px] text-fg-muted">{delterAccount.id}</span>
          ) : null}
        </div>
        <div className="mt-3">
          <Note>{delterAccount.linked ? "This workspace is linked to your Delter Account." : delterAccount.note}</Note>
        </div>
      </Section>

      <Section title="Your data" description="Counts read from the database just now, with links to each area.">
        <ul className="m-0 grid gap-2 p-0 sm:grid-cols-2">
          <DataLink href="/app/projects" label="Projects" value={formatNumber(usage.workspace.projectCount)} />
          <DataLink href="/app/chat" label="Conversations" value={formatNumber(usage.workspace.conversationCount)} />
          <DataLink href="/app/files" label="Uploaded files" value={`${formatNumber(usage.storage.fileCount)} · ${formatBytes(usage.storage.bytesOnDisk)}`} />
          <DataLink href="/app/code" label="Code files" value={formatNumber(usage.storage.codeFileCount)} />
        </ul>
        <div className="mt-4">
          <Note>
            Uploaded file bytes live in {usage.storage.backend}, keyed by your account id; code files are text rows in
            the database. Everything is scoped to your account — every query filters by your user id, so another
            signed-in user cannot reach it by changing an id in a URL.
          </Note>
        </div>
      </Section>

      <Section title="Deleting your account" description="What this build can and cannot do.">
        <Note tone="warning">
          Self-service account deletion is not part of this build, so there is no button for it here — Delter AI does
          not show controls that do nothing. Your data can be removed by deleting the rows for your account id and the
          matching stored objects; a signed-in session count of {sessions.length} is what would be
          revoked at the same time.
        </Note>
      </Section>

      <Section title="Session" description="End this device's session now.">
        <Button variant="secondary" onClick={() => void signOut()} loading={signingOut}>
          Sign out of Delter AI
        </Button>
        <p className="mt-2 text-[12px] text-fg-muted">
          You will be returned to the landing page. Other devices stay signed in unless you revoke them under Security.
        </p>
      </Section>
    </div>
  );
}

function DataLink({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-subtle px-3 py-2.5 transition-colors hover:border-border-strong"
      >
        <span className="text-[12.5px] text-fg-secondary">{label}</span>
        <span className="text-[13px] font-semibold">{value}</span>
      </Link>
    </li>
  );
}
