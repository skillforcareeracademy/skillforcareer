import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { listMaterialsForLearner } from "@/server/services/material-learner-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The reading set for this learner, in the academy's own order. */
export const GET = withRoute(async () => {
  const user = await requireApiUser();
  return ok({ materials: await listMaterialsForLearner(user.id) });
});
