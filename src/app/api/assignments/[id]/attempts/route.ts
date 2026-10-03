import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { listAssignmentAttempts } from "@/server/services/attempt-history-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every submission of this assignment. `?student=` for staff. */
export const GET = withRoute(async (req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  const studentId = new URL(req.url).searchParams.get("student") || user.id;
  const res = await listAssignmentAttempts(id, studentId, {
    id: user.id,
    roles: user.roles,
  });
  // The sheet reads `quizTitle`, so both kinds answer in the same shape.
  return ok({ attempts: res.attempts, quizTitle: res.title });
});
