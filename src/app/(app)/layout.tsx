import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { ProjectProvider, type ProjectSummary } from "@/components/workspace/ProjectProvider";
import { providerStatuses, resolveModel } from "@/lib/ai/registry";

export const dynamic = "force-dynamic";

/**
 * Workspace layout — the server-side gate for every private route.
 *
 * This is the real authorisation boundary for pages, not `proxy.ts`. The session
 * token is validated against the database here (expiry and revocation included),
 * so a stale or forged cookie cannot render any workspace data. On top of that,
 * every `/api/**` handler independently re-checks the session and the ownership
 * of whatever resource it is asked about.
 *
 * Routing contract:
 *   - no valid session      → /signin (with the target preserved)
 *   - session, no onboarding → /onboarding, which routes into /app when finished
 *   - session, onboarded     → the workspace
 */
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  if (!session) redirect("/signin");
  if (!session.user.onboardedAt) redirect("/onboarding");

  const { user } = session;

  const [projectRows, statuses] = await Promise.all([
    prisma.project.findMany({
      where: { userId: user.id, archivedAt: null },
      orderBy: [{ pinned: "desc" }, { lastOpenedAt: "desc" }, { updatedAt: "desc" }],
      take: 200,
      select: {
        id: true,
        name: true,
        description: true,
        kind: true,
        pinned: true,
        lastOpenedAt: true,
        updatedAt: true,
        _count: { select: { conversations: true, files: true, codeFiles: true } },
      },
    }),
    Promise.resolve(providerStatuses()),
  ]);

  const projects: ProjectSummary[] = projectRows.map((project) => ({
    id: project.id,
    name: project.name,
    description: project.description,
    kind: project.kind,
    pinned: project.pinned,
    lastOpenedAt: project.lastOpenedAt ? project.lastOpenedAt.toISOString() : null,
    updatedAt: project.updatedAt.toISOString(),
    counts: {
      conversations: project._count.conversations,
      files: project._count.files,
      codeFiles: project._count.codeFiles,
    },
  }));

  // Demo mode means no real provider key is configured, so responses come from
  // the offline demo provider. The shell badges this everywhere rather than
  // letting a user believe they are talking to a model.
  const demoMode = !statuses.some((status) => status.configured && status.id !== "delter-demo");
  const resolution = resolveModel(user.defaultModel, user.defaultModel);

  // Publish the account's theme before the workspace paints. The root layout's
  // ThemeScript can only read localStorage (it has no user), so a signed-in user
  // on a new device would otherwise flash the wrong theme. The value is
  // whitelisted here rather than interpolated as-is.
  const accountTheme = user.theme === "light" || user.theme === "dark" ? user.theme : "system";
  const themeBoot = `(function(){try{var t=${JSON.stringify(accountTheme)};var r=document.documentElement;r.setAttribute("data-user-theme",t);var s=null;try{s=localStorage.getItem("delter.theme")}catch(e){}var v=(s==="light"||s==="dark"||s==="system")?s:t;var d=v==="dark"||(v==="system"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      <ProjectProvider initialProjects={projects} initialActiveProjectId={null}>
      <WorkspaceShell
        user={{
          id: user.id,
          email: user.email,
          name: user.name,
          displayName: user.displayName,
        }}
        demoMode={demoMode || resolution.provider.id === "delter-demo"}
      >
          {children}
        </WorkspaceShell>
      </ProjectProvider>
    </>
  );
}
