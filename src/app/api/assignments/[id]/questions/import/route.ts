import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { importAssignmentQuestionsSchema } from "@/lib/validations/assignment";
import { importAssignmentQuestions } from "@/server/services/assignment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bulk-load a question paper. Open to instructors as well as admins — building
 * one question at a time in a dialog is the slow part of setting an assignment.
 */
export const POST = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.GRADE_ASSIGNMENT);
  const id = String((await params).id);
  const input = importAssignmentQuestionsSchema.parse(await req.json().catch(() => ({})));
  const count = await importAssignmentQuestions(id, input);
  return created({ count, message: `${count} question${count === 1 ? "" : "s"} imported.` });
});
