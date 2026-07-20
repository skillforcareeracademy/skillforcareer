import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireMeetingWrite } from "@/lib/auth/api-guard";
import { rescheduleSchema } from "@/lib/validations/live";
import { rescheduleMeeting } from "@/server/services/live-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireMeetingWrite(id);
  const input = rescheduleSchema.parse(await req.json().catch(() => ({})));
  const notified = await rescheduleMeeting(id, input);
  return ok({ message: "Class rescheduled.", notified });
});
