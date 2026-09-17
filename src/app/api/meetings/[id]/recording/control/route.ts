import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireMeetingWrite } from "@/lib/auth/api-guard";
import { recordingControlSchema } from "@/lib/validations/recording";
import {
  getRecordingControl,
  saveRecordingControl,
} from "@/server/services/recording-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Everything Admin → Live classes → Recording needs, behind the same guard as
 * the rest of the live module: `HOST_LIVE_CLASS`, with instructors limited to
 * the classes they host. Staff-only payload — it carries the direct file link.
 */
export const GET = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  await requireMeetingWrite(id);
  return ok(await getRecordingControl(id));
});

export const PATCH = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireMeetingWrite(id);
  const input = recordingControlSchema.parse(
    await req.json().catch(() => ({})),
  );
  await saveRecordingControl(id, input);
  return ok({ message: "Recording settings saved." });
});
