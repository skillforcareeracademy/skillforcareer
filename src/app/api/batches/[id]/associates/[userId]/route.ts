import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireBatchWrite } from "@/lib/auth/api-guard";
import { removeBatchAssociate } from "@/server/services/batch-associate-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withRoute(async (_req, { params }) => {
  const p = await params;
  const id = String(p.id);
  await requireBatchWrite(id);
  await removeBatchAssociate(id, String(p.userId));
  return ok({ message: "Associate instructor removed." });
});
