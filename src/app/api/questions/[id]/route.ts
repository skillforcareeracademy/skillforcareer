import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireQuizWrite } from "@/lib/auth/api-guard";
import { questionSchema } from "@/lib/validations/quiz";
import {
  updateQuestion,
  deleteQuestion,
  quizIdForQuestion,
} from "@/server/services/quiz-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  const quizId = await quizIdForQuestion(id);
  if (!quizId) throw AppError.notFound("Question not found.");
  await requireQuizWrite(quizId);
  const input = questionSchema.parse(await req.json().catch(() => ({})));
  await updateQuestion(id, input);
  return ok({ message: "Question saved." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  const quizId = await quizIdForQuestion(id);
  if (!quizId) throw AppError.notFound("Question not found.");
  await requireQuizWrite(quizId);
  await deleteQuestion(id);
  return ok({ message: "Question deleted." });
});
