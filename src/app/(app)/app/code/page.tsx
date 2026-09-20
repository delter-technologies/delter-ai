import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { codePageData } from "@/lib/code-page-data";
import { CodeStudio } from "@/components/code/CodeStudio";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ project?: string; file?: string; session?: string }>;
};

export const metadata = { title: "Code Studio" };

/**
 * Code Studio.
 *
 * Deep links are supported so a project can hand off to the editor:
 *   /app/code                       → the project with code, or the most recent one
 *   /app/code?project=<id>          → that project, if the session user owns it
 *   /app/code?project=<id>&file=src/index.html
 *   /app/code?project=<id>&session=<conversationId>  → resume an assistant session
 *
 * Every one of those ids is re-checked against the session user in the database
 * (`codePageData`), so an id belonging to somebody else falls back to a project
 * the user does own instead of leaking a name, a file or a conversation.
 */
export default async function CodeStudioPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect("/signin");
  if (!session.user.onboardedAt) redirect("/onboarding");

  const params = await searchParams;

  const data = await codePageData(session.user.id, session.user.defaultModel, {
    requestedProjectId: typeof params.project === "string" ? params.project : null,
    requestedPath: typeof params.file === "string" ? params.file : null,
    requestedSessionId: typeof params.session === "string" ? params.session : null,
  });

  return (
    <div className="h-full min-h-0">
      <CodeStudio
        projects={data.projects}
        initialProject={data.project}
        initialFiles={data.files}
        initialOpenFile={data.openFile}
        initialPreview={data.preview}
        initialSessionId={data.sessionId}
        limits={data.limits}
        models={data.ai.models.map((model) => ({
          id: model.id,
          label: model.label,
          available: model.available,
        }))}
        defaultModel={data.ai.defaultModel}
        demoMode={data.ai.demoMode}
      />
    </div>
  );
}
