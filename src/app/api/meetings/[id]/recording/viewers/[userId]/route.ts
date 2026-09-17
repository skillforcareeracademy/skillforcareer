import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireMeetingWrite } from "@/lib/auth/api-guard";
import { recordingViewerActionSchema } from "@/lib/validations/recording";
import {
  removeRecordingDevice,
  resetRecordingViews,
} from "@/server/services/recording-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Housekeeping on one learner's row in the "Who watched" table.
 *
 * Both actions exist because the client will be asked for them the first time a
 * learner changes phone mid-course: give their watches back, or free the device
 * slot the old handset is holding. One route with a named action rather than two
 * near-identical ones — they are the same permission over the same row.
 */
export const POST = withRoute(async (req, { params }) => {
  const { id, userId } = (await params) as { id: string; userId: string };
  await requireMeetingWrite(String(id));

  const input = recordingViewerActionSchema.parse(
    await req.json().catch(() => ({})),
  );
  if (input.action === "reset-views") {
    await resetRecordingViews(String(id), String(userId));
    return ok({ message: "Views reset." });
  }
  await removeRecordingDevice(String(id), String(userId), input.deviceId);
  return ok({ message: "Device removed." });
});
