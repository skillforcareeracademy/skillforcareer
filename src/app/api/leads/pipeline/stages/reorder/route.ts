import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiLeadAdmin } from "@/lib/auth/api-guard";
import { reorderStages } from "@/server/services/lead-pipeline-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ ids: z.array(z.string().min(1)).min(1).max(100) });

export const PATCH = withRoute(async (req) => {
  await requireApiLeadAdmin();
  const { ids } = schema.parse(await req.json().catch(() => ({})));
  return ok({ count: await reorderStages(ids), message: "Order saved." });
});
