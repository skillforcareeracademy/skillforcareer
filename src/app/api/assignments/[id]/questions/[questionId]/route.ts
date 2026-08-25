import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { assignmentQuestionSchema } from "@/lib/validations/assignment";
import {
  updateAssignmentQuestion,
  deleteAssignmentQuestion,
} from "@/server/services/assignment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.GRADE_ASSIGNMENT);
  const questionId = String((await params).questionId);
  const input = assignmentQuestionSchema.parse(await req.json().catch(() => ({})));
  await updateAssignmentQuestion(questionId, input);
  return ok({ message: "Question saved." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.GRADE_ASSIGNMENT);
  const questionId = String((await params).questionId);
  await deleteAssignmentQuestion(questionId);
  return ok({ message: "Question deleted." });
});
