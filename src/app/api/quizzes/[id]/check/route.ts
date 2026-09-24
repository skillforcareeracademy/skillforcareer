import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { checkAnswerSchema } from "@/lib/validations/quiz-attempt";
import { checkQuizAnswer } from "@/server/services/student-quiz-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mark one question mid-attempt — for quizzes set to show the answer after
 * every question. One question's key at a time, never the whole paper's.
 */
export const POST = withRoute(async (req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  const input = checkAnswerSchema.parse(await req.json().catch(() => ({})));
  return ok(await checkQuizAnswer(user.id, id, input));
});
