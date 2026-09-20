import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireBatchAccess } from "@/lib/auth/api-guard";
import { unassignAssignmentFromBatch } from "@/server/services/batch-assessment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withRoute(async (_req, { params }) => {
  const p = await params;
  const id = String(p.id);
  await requireBatchAccess(id);
  await unassignAssignmentFromBatch(id, String(p.assignmentId));
  return ok({ message: "Assignment removed from this batch." });
});
