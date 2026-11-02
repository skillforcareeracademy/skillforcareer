import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiLeadList } from "@/lib/auth/api-guard";
import { listStages } from "@/server/services/lead-pipeline-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The academy's stages and their sub-statuses, in order — the stage options a
 *  counsellor needs to work any lead, so every lead viewer may read them. */
export const GET = withRoute(async () => {
  await requireApiLeadList();
  return ok({ stages: await listStages() });
});
