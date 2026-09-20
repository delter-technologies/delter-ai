"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Sidebar, COLLAPSE_KEY, type SidebarUser } from "./Sidebar";
import { api, errorMessage } from "@/lib/client/api";
import { useToast } from "@/components/system/ToastProvider";
import { useTheme } from "@/components/system/ThemeProvider";
import { TopBar } from "./TopBar";
import type { ProjectSummary } from "./ProjectProvider";

/**
 * The workspace shell: sidebar + top bar + content region.
 *
 * Responsive strategy, rather than a shrunk desktop layout:
 *   - ≥1024px  sidebar is part of the flex row and can collapse to an icon rail
 *   - <1024px  sidebar becomes an overlay drawer opened from the top bar; the
 *              content region keeps the full width so the editor and chat stay
 *              usable
 *   - content scrolls independently of the shell, so the sidebar and top bar
 *     stay put while a long conversation or file list scrolls
 */
export function WorkspaceShell({
  user,
  children,
  demoMode,
}: {
  user: SidebarUser;
  children: ReactNode;
  demoMode: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { resolved } = useTheme();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* the toggle still works for this session */
      }
      return next;
    });
  }, []);

  // Escape closes the drawer; the browser also traps focus inside it.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  const onSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await api.post("/api/auth/signout");
      router.refresh();
      router.replace("/");
    } catch (error) {
      setSigningOut(false);
      toast.error("Could not sign you out", errorMessage(error));
    }
  }, [router, signingOut, toast]);

  const onNewChat = useCallback(() => {
    setDrawerOpen(false);
    router.push("/app/chat?new=1");
  }, [router]);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-bg" data-theme={resolved}>
      <Sidebar
        user={user}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        onSignOut={onSignOut}
        onNewChat={onNewChat}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenDrawer={() => setDrawerOpen(true)} demoMode={demoMode} signingOut={signingOut} />

        <main id="workspace-content" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </main>
      </div>
    </div>
  );
}

export type { ProjectSummary };
