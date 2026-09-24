import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireQuizWrite } from "@/lib/auth/api-guard";
import { generateQuestionsSchema } from "@/lib/validations/quiz";
import { generateQuizQuestions } from "@/server/services/quiz-source-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A model can take its time; the built-in reader is instant either way.
export const maxDuration = 120;

/**
 * Draft questions from a set of notes. Nothing is written to the quiz — the
 * draft goes back for review, and the editor saves what the admin keeps
 * through the usual question import.
 */
export const POST = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireQuizWrite(id);
  const input = generateQuestionsSchema.parse(await req.json().catch(() => ({})));
  return ok(await generateQuizQuestions(id, input));
});
