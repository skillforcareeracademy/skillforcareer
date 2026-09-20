import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireClassWrite } from "@/lib/auth/class-guard";
import { meetingStatusSchema } from "@/lib/validations/class-schedule";
import { setMeetingStatus } from "@/server/services/live-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start, end, cancel (with an optional reason) or reinstate a class. The
 * batch's whole teaching team may do this, not just the host — timetabled
 * classes are hosted by the lead instructor, and an associate still needs to
 * be able to cancel one. Learners and the team are told straight away.
 */
export const POST = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  const user = await requireClassWrite(id);
  const { status, reason } = meetingStatusSchema.parse(await req.json().catch(() => ({})));
  const { notified } = await setMeetingStatus(id, status, { reason, actorId: user.id });
  return ok({ message: "Status updated.", notified });
});
