import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { consumeLessonDownload } from "@/server/services/release-service";
import { ACTIVITY_ACTIONS, logActivity } from "@/server/services/activity-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Spend one download of a lesson's notes/material, and hand back the URL only
 * if there was an allowance left. The link is withheld from the player until
 * this succeeds, which is what makes the cap mean anything.
 */
export const POST = withRoute(async (req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  const lock = await consumeLessonDownload(user.id, id);
  void logActivity({
    userId: user.id,
    action: ACTIVITY_ACTIONS.LESSON_DOWNLOAD,
    entityType: "Lesson",
    entityId: id,
    request: req,
  });
  return ok(lock);
});
