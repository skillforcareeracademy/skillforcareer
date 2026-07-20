import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireMeetingWrite } from "@/lib/auth/api-guard";
import { markAttendanceSchema } from "@/lib/validations/live";
import { getAttendanceRoster, markAttendance } from "@/server/services/live-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  await requireMeetingWrite(id);
  return ok(await getAttendanceRoster(id));
});

export const POST = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireMeetingWrite(id);
  const input = markAttendanceSchema.parse(await req.json().catch(() => ({})));
  const count = await markAttendance(id, input);
  return ok({ message: "Attendance saved.", count });
});
