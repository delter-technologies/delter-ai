"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/system/ToastProvider";
import { api, ClientApiError, errorMessage } from "@/lib/client/api";
import { Note, Row, Section } from "../parts";
import type { SettingsUser } from "../SettingsView";

/**
 * Profile.
 *
 * These four fields are the ones the system prompt actually uses: the display
 * name is how the assistant addresses you, and the purpose and interests are
 * included as context in every conversation. Saving writes to the user row and
 * refreshes the workspace so the sidebar shows the new name immediately.
 */
export function ProfileTab({ user, onSaved }: { user: SettingsUser; onSaved: (user: SettingsUser) => void }) {
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState(user.name);
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [mainPurpose, setMainPurpose] = useState(user.mainPurpose ?? "");
  const [interests, setInterests] = useState(user.interests.join(", "));
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const dirty = useMemo(
    () =>
      name.trim() !== user.name ||
      displayName.trim() !== (user.displayName ?? "") ||
      mainPurpose.trim() !== (user.mainPurpose ?? "") ||
      interests.trim() !== user.interests.join(", "),
    [name, displayName, mainPurpose, interests, user],
  );

  const interestList = useMemo(
    () =>
      interests
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 12),
    [interests],
  );

  async function save() {
    setBusy(true);
    setFieldErrors({});

    if (!name.trim()) {
      setFieldErrors({ name: "Enter your name, or clear the display name instead." });
      setBusy(false);
      return;
    }

    try {
      const data = await api.patch<{
        user: { name: string; displayName: string | null; mainPurpose: string | null; interests: string[]; email: string };
      }>("/api/user/profile", {
        name: name.trim(),
        displayName: displayName.trim() || null,
        mainPurpose: mainPurpose.trim() || null,
        interests: interestList,
      });

      onSaved({
        ...user,
        name: data.user.name,
        displayName: data.user.displayName,
        mainPurpose: data.user.mainPurpose,
        interests: data.user.interests,
      });
      // The sidebar and top bar read the user from the server, so refresh them.
      router.refresh();
      toast.success("Profile saved", data.user.displayName ? `The assistant will call you ${data.user.displayName}.` : undefined);
    } catch (error) {
      if (error instanceof ClientApiError && error.issues?.length) {
        setFieldErrors(Object.fromEntries(error.issues.map((issue) => [issue.field, issue.message])));
        toast.error("Could not save your profile", error.issues[0].message);
      } else {
        toast.error("Could not save your profile", errorMessage(error, "Please try again."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Section
        title="How Delter AI addresses you"
        description="Your display name is used in replies. Your purpose and interests are sent as context with every conversation, so the assistant starts from what you actually use it for."
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => void save()} disabled={!dirty || busy || !name.trim()} loading={busy}>
              Save profile
            </Button>
            <Button
              variant="ghost"
              disabled={!dirty || busy}
              onClick={() => {
                setName(user.name);
                setDisplayName(user.displayName ?? "");
                setMainPurpose(user.mainPurpose ?? "");
                setInterests(user.interests.join(", "));
                setFieldErrors({});
              }}
            >
              Discard changes
            </Button>
            {dirty ? <span className="text-[12px] text-fg-muted">Unsaved changes</span> : null}
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Full name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={fieldErrors.name}
            maxLength={80}
            disabled={busy}
            autoComplete="name"
          />
          <Input
            label="Display name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            error={fieldErrors.displayName}
            hint={displayName.trim() ? `Replies will address you as “${displayName.trim()}”.` : "Optional. Falls back to your full name."}
            maxLength={80}
            disabled={busy}
            autoComplete="nickname"
          />
        </div>

        <div className="mt-4 space-y-4">
          <Textarea
            label="What you mainly use Delter AI for"
            value={mainPurpose}
            onChange={(event) => setMainPurpose(event.target.value)}
            error={fieldErrors.mainPurpose}
            rows={3}
            maxLength={200}
            disabled={busy}
            labelExtra={`${mainPurpose.length}/200`}
            hint="Sent to the model as context. For example: “Writing investor updates and reviewing frontend code.”"
          />
          <Input
            label="Interests"
            value={interests}
            onChange={(event) => setInterests(event.target.value)}
            error={fieldErrors.interests}
            disabled={busy}
            hint={
              interestList.length
                ? `${interestList.length} topic${interestList.length === 1 ? "" : "s"} will be sent as context: ${interestList.join(", ")}`
                : "Comma-separated, up to 12 topics. Optional."
            }
          />
        </div>
      </Section>

      <Section title="Sign-in identity" description="How you authenticate to this workspace.">
        <dl className="m-0">
          <Row label="Email address">
            <span className="font-medium">{user.email}</span>
            <span className="mt-1 block text-[12px] text-fg-muted">
              Changing an email address is not available in this build. This address, plus your password, is what signs
              you in.
            </span>
          </Row>
          <Row label="Email verified">
            {user.emailVerified ? (
              <span>Yes</span>
            ) : (
              <span className="text-fg-muted">
                Not verified — this server does not send verification email, so Delter AI does not claim it was
                confirmed.
              </span>
            )}
          </Row>
          <Row label="Member since">{new Date(user.memberSince).toLocaleDateString()}</Row>
        </dl>
        <div className="mt-3">
          <Note>
            Your password and every row of your data are stored on this server only. Nothing is shared with a third
            party except the AI provider you choose, which receives the conversation content needed to answer.
          </Note>
        </div>
      </Section>
    </div>
  );
}
