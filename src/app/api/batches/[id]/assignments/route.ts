import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireBatchAccess } from "@/lib/auth/api-guard";
import { batchAssignmentSchema } from "@/lib/validations/batch-profile";
import { assignAssignmentToBatch } from "@/server/services/batch-assessment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Set one of the course's existing assignments for this batch. */
export const POST = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireBatchAccess(id);
  const { assignmentId } = batchAssignmentSchema.parse(
    await req.json().catch(() => ({})),
  );
  await assignAssignmentToBatch(id, assignmentId);
  return created({ message: "Assignment set for this batch." });
});
