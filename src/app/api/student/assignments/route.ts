import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { listStudentAssignments } from "@/server/services/student-assignment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/student/assignments — assignments from the learner's courses. */
export const GET = withRoute(async () =>
  ok(await listStudentAssignments((await requireApiUser()).id)),
);
