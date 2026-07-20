import { withRoute } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/response";
import { requireQuizWrite } from "@/lib/auth/api-guard";
import { questionSchema, reorderQuestionsSchema } from "@/lib/validations/quiz";
import { createQuestion, reorderQuestions } from "@/server/services/quiz-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req, { params }) => {
  const quizId = String((await params).id);
  await requireQuizWrite(quizId);
  const input = questionSchema.parse(await req.json().catch(() => ({})));
  const id = await createQuestion(quizId, input);
  return created({ id, message: "Question added." });
});

export const PATCH = withRoute(async (req, { params }) => {
  const quizId = String((await params).id);
  await requireQuizWrite(quizId);
  const { ids } = reorderQuestionsSchema.parse(await req.json().catch(() => ({})));
  await reorderQuestions(quizId, ids);
  return ok({ message: "Reordered." });
});
