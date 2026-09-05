import { withRoute } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { chatIntentSchema } from "@/lib/validations/chatbot";
import { createIntent, getChatbotBoard } from "@/server/services/chatbot-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async () => {
  await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  return ok(await getChatbotBoard());
});

export const POST = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  const input = chatIntentSchema.parse(await req.json().catch(() => ({})));
  const id = await createIntent(input);
  return created({ id, message: "Ami has learnt that." });
});
