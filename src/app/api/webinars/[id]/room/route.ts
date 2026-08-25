import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { generateWebinarRoom } from "@/server/services/webinar-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/webinars/<id>/room — issue (or return) the webinar's join link. */
export const POST = withRoute(async (_req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.HOST_LIVE_CLASS);
  const id = String((await params).id);
  const { joinUrl, roomCode } = await generateWebinarRoom(id, user.id);
  return ok({ joinUrl, roomCode, message: "Join link ready." });
});
