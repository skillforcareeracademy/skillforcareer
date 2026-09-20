import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireClassWrite } from "@/lib/auth/class-guard";
import { rescheduleSchema } from "@/lib/validations/live";
import { rescheduleMeeting } from "@/server/services/live-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Move a class. Open to the batch's teaching team as well as the host. */
export const POST = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  const user = await requireClassWrite(id);
  const input = rescheduleSchema.parse(await req.json().catch(() => ({})));
  const notified = await rescheduleMeeting(id, input, user.id);
  return ok({ message: "Class rescheduled.", notified });
});
