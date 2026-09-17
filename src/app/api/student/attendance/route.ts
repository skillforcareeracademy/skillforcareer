import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { getStudentAttendance } from "@/server/services/student-attendance-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/student/attendance — the learner's own class register. */
export const GET = withRoute(async () =>
  ok(await getStudentAttendance((await requireApiUser()).id)),
);
