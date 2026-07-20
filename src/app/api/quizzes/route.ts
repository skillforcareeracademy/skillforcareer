import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiPermission, userOwnsCourse } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { createQuizSchema } from "@/lib/validations/quiz";
import { createQuiz } from "@/server/services/quiz-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_QUIZ);
  const input = createQuizSchema.parse(await req.json().catch(() => ({})));
  // Instructors may only attach quizzes to their own courses.
  if (input.courseId && !(await userOwnsCourse(user, input.courseId))) {
    throw AppError.forbidden("You can only add quizzes to your own courses.");
  }
  const id = await createQuiz(input, user.id);
  return created({ id, message: "Quiz created." });
});
