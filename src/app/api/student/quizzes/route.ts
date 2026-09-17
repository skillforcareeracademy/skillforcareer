import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { listStudentQuizzes } from "@/server/services/student-quiz-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/student/quizzes — the quizzes set for this learner. */
export const GET = withRoute(async () => ok(await listStudentQuizzes((await requireApiUser()).id)));
