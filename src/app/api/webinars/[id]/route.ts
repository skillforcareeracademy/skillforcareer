import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { webinarSchema } from "@/lib/validations/webinar";
import { updateWebinar, deleteWebinar } from "@/server/services/webinar-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.HOST_LIVE_CLASS);
  const id = String((await params).id);
  const input = webinarSchema.parse(await req.json().catch(() => ({})));
  await updateWebinar(id, input);
  return ok({ message: "Webinar saved." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.HOST_LIVE_CLASS);
  const id = String((await params).id);
  await deleteWebinar(id);
  return ok({ message: "Webinar deleted." });
});
