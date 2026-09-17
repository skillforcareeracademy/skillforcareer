import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api-guard";
import { getQuizForAttempt } from "@/server/services/student-quiz-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/student/quizzes/[id] — the question paper for an attempt.
 * The service strips the correct answers, exactly as the web page relies on.
 */
export const GET = withRoute(async (_req, ctx) => {
  const user = await requireApiUser();
  const { id } = (await ctx.params) as { id: string };
  const quiz = await getQuizForAttempt(user.id, id);
  if (!quiz) throw AppError.notFound("This quiz isn't available to you.");
  return ok(quiz);
});
