import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireMeetingWrite } from "@/lib/auth/api-guard";
import { removeMeetingStudent } from "@/server/services/live-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withRoute(async (_req, { params }) => {
  const p = await params;
  const id = String(p.id);
  await requireMeetingWrite(id);
  await removeMeetingStudent(id, String(p.userId));
  return ok({ message: "Student removed." });
});
