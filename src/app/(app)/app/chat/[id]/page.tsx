import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { chatPageData } from "@/lib/chat-page-data";
import { ChatSurface } from "@/components/chat/ChatSurface";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return { title: "Chat" };

  const conversation = await prisma.conversation.findFirst({
    where: { id, userId: session.user.id },
    select: { title: true },
  });
  return { title: conversation?.title ?? "Chat" };
}

/**
 * An existing conversation.
 *
 * The ownership check happens here as well as in the API, so an id belonging to
 * another user renders the 404 page rather than a shell that then fails to load.
 */
export default async function ConversationPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/signin");
  if (!session.user.onboardedAt) redirect("/onboarding");

  const { id } = await params;

  const conversation = await prisma.conversation.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, kind: true },
  });
  if (!conversation) notFound();

  // A Code Studio conversation belongs to that tool's history, not to Chat.
  if (conversation.kind === "code") redirect("/app/code");

  const data = await chatPageData(session.user.id, session.user.defaultModel);

  return (
    <ChatSurface
      conversationId={conversation.id}
      demoMode={data.demoMode}
      models={data.models.map((model) => ({ id: model.id, label: model.label, provider: model.provider, available: model.available }))}
      defaultModel={data.defaultModel}
    />
  );
}
