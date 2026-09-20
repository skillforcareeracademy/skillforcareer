import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireBatchAccess } from "@/lib/auth/api-guard";
import { batchQuizSchema } from "@/lib/validations/batch-profile";
import { assignQuizToBatch } from "@/server/services/batch-assessment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Set one of the course's existing quizzes for this batch. */
export const POST = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireBatchAccess(id);
  const { quizId } = batchQuizSchema.parse(await req.json().catch(() => ({})));
  await assignQuizToBatch(id, quizId);
  return created({ message: "Quiz set for this batch." });
});
