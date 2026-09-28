import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { readersOfMaterial } from "@/server/services/material-learner-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who has opened this material, how often, and for how long. */
export const GET = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  const readers = await readersOfMaterial(String((await params).id));
  return ok({ readers });
});
