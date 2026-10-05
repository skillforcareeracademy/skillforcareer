import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { unlinkContent } from "@/server/services/content-link-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Separate two pieces again. */
export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  await unlinkContent(String((await params).id));
  return ok({ message: "Unlinked." });
});
