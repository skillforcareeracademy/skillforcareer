import { withRoute } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import {
  assignmentQuestionSchema,
  reorderAssignmentQuestionsSchema,
} from "@/lib/validations/assignment";
import {
  listAssignmentQuestions,
  addAssignmentQuestion,
  reorderAssignmentQuestions,
} from "@/server/services/assignment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.GRADE_ASSIGNMENT);
  const id = String((await params).id);
  return ok({ questions: await listAssignmentQuestions(id) });
});

export const POST = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.GRADE_ASSIGNMENT);
  const id = String((await params).id);
  const input = assignmentQuestionSchema.parse(await req.json().catch(() => ({})));
  const questionId = await addAssignmentQuestion(id, input);
  return created({ id: questionId, message: "Question added." });
});

/** PATCH — reorder. The body is the full id list, in the order wanted. */
export const PATCH = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.GRADE_ASSIGNMENT);
  const id = String((await params).id);
  const { ids } = reorderAssignmentQuestionsSchema.parse(await req.json().catch(() => ({})));
  await reorderAssignmentQuestions(id, ids);
  return ok({ message: "Order saved." });
});
