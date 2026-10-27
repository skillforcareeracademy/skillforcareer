import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api-guard";
import { assignRecordingToBatch } from "@/server/services/recording-request-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ batchId: z.string().min(1) });

/** POST /api/recordings/:meetingId/assign — open a recording to another batch. */
export const POST = withRoute(async (req, { params }) => {
  await requireApiStaff();
  const { meetingId } = (await params) as { meetingId: string };
  const { batchId } = schema.parse(await req.json().catch(() => ({})));
  await assignRecordingToBatch(String(meetingId), batchId);
  return ok({ message: "Recording assigned to the batch." });
});
