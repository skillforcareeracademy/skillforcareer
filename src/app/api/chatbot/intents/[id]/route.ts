import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { chatIntentSchema } from "@/lib/validations/chatbot";
import { deleteIntent, updateIntent } from "@/server/services/chatbot-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  const id = String((await params).id);
  const input = chatIntentSchema.parse(await req.json().catch(() => ({})));
  await updateIntent(id, input);
  return ok({ message: "Answer updated." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  await deleteIntent(String((await params).id));
  return ok({ message: "Answer removed." });
});
