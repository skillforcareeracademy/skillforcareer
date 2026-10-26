import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api-guard";
import { recordingRequestActionSchema } from "@/lib/validations/recording";
import {
  approveRecordingRequest,
  declineRecordingRequest,
} from "@/server/services/recording-request-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/recordings/requests/:id — staff approve (free or priced) or decline
 * a learner's recording request.
 */
export const PATCH = withRoute(async (req, { params }) => {
  const user = await requireApiStaff();
  const { id } = (await params) as { id: string };
  const input = recordingRequestActionSchema.parse(
    await req.json().catch(() => ({})),
  );

  if (input.action === "approve") {
    await approveRecordingRequest(String(id), user.id, {
      price: input.price,
      accessDays: input.accessDays,
    });
    return ok({
      message:
        input.price > 0
          ? "Approved — the learner can now pay to unlock it."
          : "Shared — the learner can watch it now.",
    });
  }

  await declineRecordingRequest(String(id), user.id);
  return ok({ message: "Request declined." });
});
