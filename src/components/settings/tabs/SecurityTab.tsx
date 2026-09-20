"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Badge } from "@/components/ui/States";
import { useToast } from "@/components/system/ToastProvider";
import { useConfirm } from "@/components/system/ConfirmProvider";
import { api, errorMessage } from "@/lib/client/api";
import { formatDateTime, relativeTime } from "@/lib/client/format";
import { Note, Section } from "../parts";
import type { SettingsSession } from "../SettingsView";

/**
 * Security.
 *
 * Changing a password revokes every other session on the server, which is the
 * point of changing one. The device list is built from real session rows: what
 * is shown is what the User-Agent string actually said, and revoking writes
 * `revokedAt` so that cookie stops working immediately.
 */
export function SecurityTab({
  sessions,
  onSessionsChanged,
  resetEmailConfigured,
}: {
  sessions: SettingsSession[];
  onSessionsChanged: (sessions: SettingsSession[]) => void;
  resetEmailConfigured: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm: confirmDialog } = useConfirm();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  async function changePassword() {
    setFormError(null);

    if (newPassword.length < 8) {
      setFormError("New passwords must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError("The two new passwords do not match.");
      return;
    }
    if (!currentPassword) {
      setFormError("Enter your current password to confirm this change.");
      return;
    }

    setBusy(true);
    try {
      const data = await api.post<{ changed: true; otherSessionsSignedOut: number }>("/api/auth/change-password", {
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(
        "Password changed",
        data.otherSessionsSignedOut
          ? `${data.otherSessionsSignedOut} other device${data.otherSessionsSignedOut === 1 ? " was" : "s were"} signed out.`
          : "This device stays signed in.",
      );
      await refreshSessions();
    } catch (error) {
      const message = errorMessage(error, "Delter AI could not change your password.");
      setFormError(message);
      toast.error("Password not changed", message);
    } finally {
      setBusy(false);
    }
  }

  async function refreshSessions() {
    try {
      const data = await api.get<{ sessions: SettingsSession[] }>("/api/auth/sessions");
      onSessionsChanged(data.sessions);
    } catch {
      // The list is a convenience; a failure to refresh it is not worth a toast.
    }
  }

  async function revoke(session: SettingsSession) {
    const proceed = session.current
      ? await confirmDialog({
          title: "Sign out of this device?",
          description: "Your session ends immediately and you will be returned to the sign-in page.",
          confirmLabel: "Sign out",
          tone: "danger",
        })
      : await confirmDialog({
          title: `Sign out ${session.device}?`,
          description: `That session stops working the moment you confirm. It was last used ${relativeTime(session.lastSeenAt)}.`,
          confirmLabel: "Sign out that device",
          tone: "danger",
        });
    if (!proceed) return;

    setRevoking(session.id);
    try {
      const data = await api.del<{ revoked: true; current: boolean }>(
        `/api/auth/sessions/${encodeURIComponent(session.id)}`,
      );
      if (data.current) {
        router.replace("/signin");
        router.refresh();
        return;
      }
      onSessionsChanged(sessions.filter((entry) => entry.id !== session.id));
      toast.success("Device signed out", `${session.device} can no longer use this account.`);
    } catch (error) {
      toast.error("Could not sign out that device", errorMessage(error, "Please try again."));
    } finally {
      setRevoking(null);
    }
  }

  const otherSessions = sessions.filter((session) => !session.current);

  return (
    <div className="space-y-5">
      <Section
        title="Change password"
        description="Requires your current password. Every other device is signed out when the change succeeds."
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              onClick={() => void changePassword()}
              loading={busy}
              disabled={busy || mismatch || !currentPassword || !newPassword}
            >
              Change password
            </Button>
            {formError ? (
              <span className="text-[12px]" style={{ color: "var(--danger)" }} role="alert">
                {formError}
              </span>
            ) : null}
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Current password"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            disabled={busy}
          />
          <Input
            label="New password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            disabled={busy}
            hint="At least 8 characters."
          />
          <Input
            label="Confirm new password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            disabled={busy}
            error={mismatch ? "These do not match." : null}
          />
        </div>
      </Section>

      <Section
        title="Signed-in devices"
        description="Sessions that currently hold a valid cookie for this account. Revoking one takes effect immediately."
        footer={
          otherSessions.length ? (
            <Button
              variant="secondary"
              disabled={Boolean(revoking)}
              onClick={async () => {
                const proceed = await confirmDialog({
                  title: `Sign out ${otherSessions.length} other device${otherSessions.length === 1 ? "" : "s"}?`,
                  description: "This device stays signed in. Every other session for your account is revoked now.",
                  confirmLabel: "Sign them out",
                  tone: "danger",
                });
                if (!proceed) return;
                setRevoking("all");
                try {
                  for (const session of otherSessions) {
                    await api.del(`/api/auth/sessions/${encodeURIComponent(session.id)}`);
                  }
                  onSessionsChanged(sessions.filter((entry) => entry.current));
                  toast.success("Other devices signed out", `${otherSessions.length} session${otherSessions.length === 1 ? "" : "s"} revoked.`);
                } catch (error) {
                  toast.error("Could not sign out every device", errorMessage(error, "Some sessions may still be active."));
                  await refreshSessions();
                } finally {
                  setRevoking(null);
                }
              }}
            >
              Sign out all other devices
            </Button>
          ) : (
            <span className="text-[12px] text-fg-muted">This is the only active session.</span>
          )
        }
      >
        {sessions.length === 0 ? (
          <p className="text-[12.5px] text-fg-muted">No active sessions were returned.</p>
        ) : (
          <ul className="m-0 space-y-2 p-0">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-bg-subtle px-3 py-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium">{session.device}</span>
                    {session.current ? <Badge tone="accent">this device</Badge> : null}
                    {session.remember ? <Badge tone="neutral">kept signed in</Badge> : null}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-fg-muted">
                    Last used {relativeTime(session.lastSeenAt)} · signed in {formatDateTime(session.createdAt)} ·
                    expires {formatDateTime(session.expiresAt)}
                  </span>
                  {session.userAgent ? (
                    <span className="mt-1 block truncate font-mono text-[11px] text-fg-faint" title={session.userAgent}>
                      {session.userAgent}
                    </span>
                  ) : null}
                </span>
                <Button
                  size="sm"
                  variant={session.current ? "secondary" : "danger"}
                  loading={revoking === session.id || revoking === "all"}
                  disabled={Boolean(revoking)}
                  onClick={() => void revoke(session)}
                >
                  {session.current ? "Sign out" : "Revoke"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Password reset" description="What happens when you use “Forgot password”.">
        <Note tone={resetEmailConfigured ? "info" : "warning"}>
          {resetEmailConfigured
            ? "Reset links are delivered by email from this server."
            : "No email delivery service is configured on this server (RESET_EMAIL_URL is not set). Rather than pretending to send an email, Delter AI returns the reset link in the response so you can complete the reset yourself. Set RESET_EMAIL_URL in .env to deliver it by email instead."}
        </Note>
      </Section>
    </div>
  );
}
