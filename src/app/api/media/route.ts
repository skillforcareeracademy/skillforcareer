import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { listMedia } from "@/server/services/media-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The media library, newest first. Staff only — uploads are internal assets. */
export const GET = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  const sp = new URL(req.url).searchParams;
  const data = await listMedia({
    search: sp.get("search") || undefined,
    kind: sp.get("kind") || undefined,
    page: Number(sp.get("page")) || 1,
    pageSize: Number(sp.get("pageSize")) || 40,
  });
  return ok(data);
});
