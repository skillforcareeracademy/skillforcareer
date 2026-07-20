import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireQuizWrite } from "@/lib/auth/api-guard";
import { updateQuizSchema } from "@/lib/validations/quiz";
import { getQuizEdit, updateQuiz, deleteQuiz } from "@/server/services/quiz-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  await requireQuizWrite(id);
  return ok(await getQuizEdit(id));
});

export const PATCH = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireQuizWrite(id);
  const input = updateQuizSchema.parse(await req.json().catch(() => ({})));
  await updateQuiz(id, input);
  return ok({ message: "Quiz saved." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  await requireQuizWrite(id);
  await deleteQuiz(id);
  return ok({ message: "Quiz deleted." });
});
