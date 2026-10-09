import { withRoute } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/response";
import { requireQuizWrite } from "@/lib/auth/api-guard";
import { z } from "zod";
import { questionSchema, reorderQuestionsSchema } from "@/lib/validations/quiz";
import {
  createQuestion,
  deleteQuestions,
  reorderQuestions,
} from "@/server/services/quiz-service";

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

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Choose at least one question").max(500),
});

/** Throw several questions away at once. */
export const DELETE = withRoute(async (req, { params }) => {
  const quizId = String((await params).id);
  await requireQuizWrite(quizId);
  const { ids } = bulkDeleteSchema.parse(await req.json().catch(() => ({})));
  const count = await deleteQuestions(quizId, ids);
  return ok({
    count,
    message: `${count} question${count === 1 ? "" : "s"} deleted.`,
  });
});
