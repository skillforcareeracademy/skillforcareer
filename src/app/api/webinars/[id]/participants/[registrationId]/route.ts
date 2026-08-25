import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { removeWebinarParticipant } from "@/server/services/webinar-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.HOST_LIVE_CLASS);
  const p = await params;
  await removeWebinarParticipant(String(p.id), String(p.registrationId));
  return ok({ message: "Participant removed." });
});
