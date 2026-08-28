import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { getPageSections } from "@/server/services/page-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async () => {
  await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  return ok(await getPageSections());
});
