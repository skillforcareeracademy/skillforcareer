import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { submitQuizSchema } from "@/lib/validations/quiz-attempt";
import { submitQuizAttempt } from "@/server/services/student-quiz-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  const input = submitQuizSchema.parse(await req.json().catch(() => ({})));
  const result = await submitQuizAttempt(user.id, id, input);
  return ok(result);
});
