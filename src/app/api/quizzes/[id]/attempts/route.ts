import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { listQuizAttemptsWithPass } from "@/server/services/attempt-history-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Every attempt on this quiz. A learner gets their own; staff and instructors
 * may ask for a named learner's with `?student=`.
 */
export const GET = withRoute(async (req, { params }) => {
  const user = await requireApiUser();
  const quizId = String((await params).id);
  const studentId = new URL(req.url).searchParams.get("student") || user.id;
  return ok(
    await listQuizAttemptsWithPass(quizId, studentId, { id: user.id, roles: user.roles }),
  );
});
