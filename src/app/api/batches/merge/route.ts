import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiPermission, isStaffRole } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { mergeBatches } from "@/server/services/batch-merge-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  targetBatchId: z.string().min(1, "Choose the batch to keep"),
  sourceBatchIds: z.array(z.string().min(1)).min(1, "Choose at least one batch to merge in"),
});

/** Fold one or more batches into another. Admins only — it moves live data. */
export const POST = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_BATCHES);
  if (!isStaffRole(user.role)) {
    throw AppError.forbidden("Only an administrator can merge batches.");
  }
  const input = schema.parse(await req.json().catch(() => ({})));
  const id = await mergeBatches(input.targetBatchId, input.sourceBatchIds, {
    id: user.id,
  });
  return created({ id, message: "Batches merged." });
});
