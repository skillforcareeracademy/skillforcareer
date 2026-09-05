import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { dismissUnanswered } from "@/server/services/chatbot-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Drop a question from the "teach Ami" queue without writing an answer. */
export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  await dismissUnanswered(String((await params).id));
  return ok({ message: "Removed from the queue." });
});
