import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { importIntentsSchema } from "@/lib/validations/chatbot";
import { importIntents } from "@/server/services/chatbot-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Teach Ami a sheet's worth of answers at once. */
export const POST = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  const input = importIntentsSchema.parse(await req.json().catch(() => ({})));
  return ok(await importIntents(input));
});
