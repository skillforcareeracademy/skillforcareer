import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import {
  getChatbotBoard,
  listAbstracts,
} from "@/server/services/chatbot-service";
import { getSettings } from "@/server/services/settings-service";
import { ChatbotClient } from "@/components/admin/chatbot/chatbot-client";

export const metadata: Metadata = { title: "Assistant" };
export const dynamic = "force-dynamic";

/**
 * Where Ami is trained. Gated on the same permission as the rest of the site
 * content — the assistant speaks for the academy, so whoever edits the homepage
 * copy edits this too.
 */
export default async function ChatbotPage() {
  await requirePermission(PERMISSIONS.MANAGE_HOMEPAGE);
  const [board, abstracts, { settings }] = await Promise.all([
    getChatbotBoard(),
    listAbstracts(),
    getSettings(),
  ]);
  return (
    <ChatbotClient
      board={board}
      abstracts={abstracts}
      assistantName={settings.chatbotName}
    />
  );
}
