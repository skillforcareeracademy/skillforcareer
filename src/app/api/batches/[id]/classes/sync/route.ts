import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireBatchClassWrite } from "@/lib/auth/class-guard";
import { syncAndAnnounce } from "@/server/services/class-schedule-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — "Rebuild timetable": re-create the batch's classes from its days and
 * time. Classes changed by hand, and anything that already happened, are kept.
 */
export const POST = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  const user = await requireBatchClassWrite(id);
  const r = await syncAndAnnounce(id, "rebuilt", user.id);
  const parts = [
    r.created && `${r.created} added`,
    r.updated && `${r.updated} updated`,
    r.removed && `${r.removed} removed`,
    r.holidayCancelled.length && `${r.holidayCancelled.length} cancelled for holidays`,
    r.revivedIds.length && `${r.revivedIds.length} restored`,
  ].filter(Boolean);
  return ok({
    created: r.created,
    updated: r.updated,
    removed: r.removed,
    holidayCancelled: r.holidayCancelled.length,
    restored: r.revivedIds.length,
    message: parts.length ? `Timetable rebuilt — ${parts.join(", ")}.` : "Timetable is already up to date.",
  });
});
