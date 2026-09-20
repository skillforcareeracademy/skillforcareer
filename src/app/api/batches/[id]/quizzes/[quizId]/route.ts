import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireBatchAccess } from "@/lib/auth/api-guard";
import { unassignQuizFromBatch } from "@/server/services/batch-assessment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withRoute(async (_req, { params }) => {
  const p = await params;
  const id = String(p.id);
  await requireBatchAccess(id);
  await unassignQuizFromBatch(id, String(p.quizId));
  return ok({ message: "Quiz removed from this batch." });
});
