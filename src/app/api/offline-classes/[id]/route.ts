import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireMeetingWrite } from "@/lib/auth/api-guard";
import { offlineClassSchema } from "@/lib/validations/live";
import {
  updateOfflineClass,
  deleteOfflineClass,
} from "@/server/services/live-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Offline classes are Meetings, but they can't reuse `/api/meetings/[id]`:
 * that PATCH takes the live-class shape (host, status, recording) and never
 * writes `location`, so editing a venue through it would silently drop it.
 */

export const PATCH = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireMeetingWrite(id);
  const input = offlineClassSchema.parse(await req.json().catch(() => ({})));
  await updateOfflineClass(id, input);
  return ok({ message: "Offline class saved." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  await requireMeetingWrite(id);
  await deleteOfflineClass(id);
  return ok({ message: "Offline class deleted." });
});
