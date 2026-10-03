import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { boardFilters } from "@/server/services/board-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The classes, batches and courses a page can be filed under. */
export const GET = withRoute(async () => {
  const user = await requireApiPermission(PERMISSIONS.HOST_LIVE_CLASS);
  return ok(await boardFilters({ id: user.id, roles: user.roles }));
});
