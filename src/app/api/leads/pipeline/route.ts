import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { listStages } from "@/server/services/lead-pipeline-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The academy's stages and their sub-statuses, in order. */
export const GET = withRoute(async () => {
  await requireApiPermission(PERMISSIONS.MANAGE_LEADS);
  return ok({ stages: await listStages() });
});
