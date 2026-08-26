import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { reorderHomeSchema, type HomeSectionKey } from "@/lib/validations/homepage";
import { getHomeSections, reorderHomeSections } from "@/server/services/homepage-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async () => {
  await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  return ok(await getHomeSections());
});

/** Reorder the page. Takes the complete key list, top to bottom. */
export const PATCH = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  const { keys } = reorderHomeSchema.parse(await req.json().catch(() => ({})));
  await reorderHomeSections(keys as HomeSectionKey[], user.id);
  return ok({ message: "Section order saved." });
});
