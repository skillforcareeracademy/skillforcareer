import { withRoute } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { requireBatchClassWrite } from "@/lib/auth/class-guard";
import { addBatchClassSchema } from "@/lib/validations/class-schedule";
import { addBatchClass, listBatchClasses } from "@/server/services/class-schedule-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — the batch's classes (upcoming first) with completed/pending counts. */
export const GET = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  await requireBatchClassWrite(id);
  return ok(await listBatchClasses(id));
});

/** POST — add an extra class by hand. Learners and the teaching team are emailed. */
export const POST = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  const user = await requireBatchClassWrite(id);
  const input = addBatchClassSchema.parse(await req.json().catch(() => ({})));
  const { id: meetingId, notified } = await addBatchClass(id, input, user.id);
  return created({ id: meetingId, notified, message: "Class added." });
});
