import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { consumeLessonView } from "@/server/services/release-service";
import { ACTIVITY_ACTIONS, logActivity } from "@/server/services/activity-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Spend one of the learner's allowed views of a lesson.
 *
 * The player calls this as a lesson opens, and the answer carries the lock as
 * it stands *afterwards* — so the last permitted view can be announced as such
 * rather than the learner discovering the cap by being shut out next time.
 */
export const POST = withRoute(async (req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  const lock = await consumeLessonView(user.id, id);
  void logActivity({
    userId: user.id,
    action: ACTIVITY_ACTIONS.LESSON_VIEW,
    entityType: "Lesson",
    entityId: id,
    request: req,
  });
  return ok(lock);
});
