import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { chatPageData } from "@/lib/chat-page-data";
import { ChatSurface } from "@/components/chat/ChatSurface";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chat" };

/**
 * New chat.
 *
 * The conversation row is created on the first message rather than on page load,
 * so an abandoned empty chat never litters the history list.
 */
export default async function NewChatPage() {
  const session = await getSession();
  if (!session) redirect("/signin");
  if (!session.user.onboardedAt) redirect("/onboarding");

  const data = await chatPageData(session.user.id, session.user.defaultModel);

  return (
    <ChatSurface
      conversationId={null}
      demoMode={data.demoMode}
      models={data.models.map((model) => ({ id: model.id, label: model.label, provider: model.provider, available: model.available }))}
      defaultModel={data.defaultModel}
    />
  );
}
