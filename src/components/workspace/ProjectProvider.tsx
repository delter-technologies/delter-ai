"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Workspace project context.
 *
 * This is what makes Delter AI feel like one product instead of a set of
 * mini-apps: a single "current project" that Chat, Files and Code Studio all
 * read. Pick a project in the sidebar and the assistant in every tool answers
 * with that project's files, instructions and history in scope.
 *
 * The choice persists in localStorage so a refresh or a navigation between tools
 * does not silently drop the context you were working in.
 */

export type ProjectSummary = {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  pinned: boolean;
  lastOpenedAt: string | null;
  updatedAt: string;
  counts: { conversations: number; files: number; codeFiles: number };
};

type ProjectContextValue = {
  projects: ProjectSummary[];
  /** Null means "no project" — the AI then works without project context. */
  activeProjectId: string | null;
  activeProject: ProjectSummary | null;
  setActiveProjectId: (id: string | null) => void;
  setProjects: (projects: ProjectSummary[]) => void;
  /** Add or replace one project after a create/rename, without a full refetch. */
  upsertProject: (project: ProjectSummary) => void;
  removeProject: (id: string) => void;
  loading: boolean;
  refresh: () => Promise<void>;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

const STORAGE_KEY = "delter.activeProject";

export function ProjectProvider({
  children,
  initialProjects,
  initialActiveProjectId,
}: {
  children: ReactNode;
  initialProjects: ProjectSummary[];
  initialActiveProjectId?: string | null;
}) {
  const [projects, setProjects] = useState<ProjectSummary[]>(initialProjects);
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(initialActiveProjectId ?? null);
  const [loading, setLoading] = useState(false);

  // Restore the last project the user was working in.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    if (initialActiveProjectId) return; // a URL-provided project wins
    if (stored && initialProjects.some((project) => project.id === stored)) {
      setActiveProjectIdState(stored);
    }
    // Deliberately runs once: only initialProjects from the server matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setActiveProjectId = useCallback(
    (id: string | null) => {
      setActiveProjectIdState(id);
      try {
        if (id) window.localStorage.setItem(STORAGE_KEY, id);
        else window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Storage unavailable (private mode); context still works for this session.
      }
    },
    [],
  );

  const upsertProject = useCallback((project: ProjectSummary) => {
    setProjects((current) => {
      const index = current.findIndex((item) => item.id === project.id);
      if (index === -1) return [project, ...current];
      const next = [...current];
      next[index] = project;
      return next;
    });
  }, []);

  const removeProject = useCallback(
    (id: string) => {
      setProjects((current) => current.filter((project) => project.id !== id));
      setActiveProjectIdState((currentId) => {
        if (currentId !== id) return currentId;
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
        return null;
      });
    },
    [],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/projects?limit=200", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) return;
      const payload = (await response.json()) as { data?: { projects?: ProjectSummary[] } };
      if (payload.data?.projects) setProjects(payload.data.projects);
    } catch {
      // A failed background refresh must not break the shell; the list from the
      // server render stays on screen.
    } finally {
      setLoading(false);
    }
  }, []);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  const value = useMemo<ProjectContextValue>(
    () => ({
      projects,
      activeProjectId,
      activeProject,
      setActiveProjectId,
      setProjects,
      upsertProject,
      removeProject,
      loading,
      refresh,
    }),
    [projects, activeProjectId, activeProject, setActiveProjectId, upsertProject, removeProject, loading, refresh],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProjects(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) throw new Error("useProjects must be used inside <ProjectProvider>.");
  return context;
}

/** Same context, but safe to call from components that may render outside it. */
export function useProjectsOptional(): ProjectContextValue | null {
  return useContext(ProjectContext);
}
