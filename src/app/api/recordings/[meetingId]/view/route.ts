import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api-guard";
import { DEVICE_ID_HEADER } from "@/lib/device-id";
import { recordingViewSchema } from "@/lib/validations/recording";
import { registerRecordingView } from "@/server/services/recording-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/recordings/:meetingId/view — a watch is starting.
 *
 * Called when the learner actually presses play, never on page load: opening the
 * live-classes list must not quietly spend anybody's allowance. The reply is
 * what the player needs to run — how much is left, whether the overlay is on,
 * and the ticket the stream route wants — and its refusals are the only place a
 * view or device cap is enforced.
 *
 * The same endpoint takes the player's progress pings. A ping carries the ticket
 * it was given, which marks it as the same watch continuing, so pausing,
 * scrubbing or closing the dialog never costs a second view.
 */
export const POST = withRoute(async (req, { params }) => {
  const { meetingId } = (await params) as { meetingId: string };
  const user = await requireApiUser();

  const deviceId = req.headers.get(DEVICE_ID_HEADER)?.trim();
  if (!deviceId || deviceId.length > 100) {
    throw AppError.badRequest(
      "Couldn't identify this device. Try reloading the page.",
    );
  }

  const input = recordingViewSchema.parse(await req.json().catch(() => ({})));
  const result = await registerRecordingView(
    user,
    String(meetingId),
    deviceId,
    req.headers.get("user-agent"),
    input,
  );
  return ok(result);
});
