import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { webinarSchema } from "@/lib/validations/webinar";
import { createWebinar } from "@/server/services/webinar-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.HOST_LIVE_CLASS);
  const input = webinarSchema.parse(await req.json().catch(() => ({})));
  const id = await createWebinar(input, user.id);
  return created({ id, message: "Webinar created." });
});
