import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { listStudentMeetings } from "@/server/services/live-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/student/live — live and offline classes for this learner. */
export const GET = withRoute(async () => ok(await listStudentMeetings((await requireApiUser()).id)));
