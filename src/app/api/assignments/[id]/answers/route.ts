import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { assignmentAnswersSchema } from "@/lib/validations/assignment";
import { submitAssignmentAnswers } from "@/server/services/student-assignment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/assignments/<id>/answers — hand in an MCQ or Q&A paper. */
export const POST = withRoute(async (req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.SUBMIT_ASSIGNMENT);
  const id = String((await params).id);
  const input = assignmentAnswersSchema.parse(await req.json().catch(() => ({})));
  const result = await submitAssignmentAnswers(user.id, id, input);
  return created({
    ...result,
    message: result.needsMarking
      ? "Submitted — your instructor will mark the written answers."
      : `Submitted — you scored ${result.autoScore}/${result.maxScore}.`,
  });
});
