import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { listStudentsForSelect } from "@/server/services/live-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Students available to add to a class, for the picker.
 *
 * Gated on HOST_LIVE_CLASS rather than MANAGE_USERS: an instructor who can run a
 * class needs to pick its attendees, but has no business in user management.
 */
export const GET = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.HOST_LIVE_CLASS);
  const search = new URL(req.url).searchParams.get("search") ?? undefined;
  return ok({ students: await listStudentsForSelect(search || undefined) });
});
