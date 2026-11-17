import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiPermission, isStaffRole } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { separateMerge } from "@/server/services/batch-merge-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Undo a merge — put every merged batch back exactly as it was. */
export const POST = withRoute(async (_req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_BATCHES);
  if (!isStaffRole(user.role)) {
    throw AppError.forbidden("Only an administrator can separate batches.");
  }
  const id = String((await params).id);
  await separateMerge(id);
  return ok({ message: "Batches separated." });
});
