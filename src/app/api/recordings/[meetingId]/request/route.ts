import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { requestRecording } from "@/server/services/recording-request-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/recordings/:meetingId/request — a learner asks for a recording they
 * can't currently watch. Idempotent per learner+class (see requestRecording).
 */
export const POST = withRoute(async (req, { params }) => {
  const user = await requireApiUser();
  const { meetingId } = (await params) as { meetingId: string };
  const body = (await req.json().catch(() => ({}))) as { note?: unknown };
  const note =
    typeof body?.note === "string" ? body.note.slice(0, 1000) : undefined;
  return ok(await requestRecording(user.id, String(meetingId), note));
});
