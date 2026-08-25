import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { importQuestionsSchema } from "@/lib/validations/quiz";
import { importQuestions } from "@/server/services/quiz-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bulk-load a question bank. Open to instructors as well as admins — typing a
 * fifty-question paper into a dialog one at a time is the slow part.
 */
export const POST = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_QUIZ);
  const id = String((await params).id);
  const input = importQuestionsSchema.parse(await req.json().catch(() => ({})));
  const count = await importQuestions(id, input);
  return created({ count, message: `${count} question${count === 1 ? "" : "s"} imported.` });
});
