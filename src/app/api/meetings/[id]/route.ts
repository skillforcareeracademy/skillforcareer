import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireMeetingWrite } from "@/lib/auth/api-guard";
import { updateMeetingSchema } from "@/lib/validations/live";
import {
  getMeetingDetail,
  updateMeeting,
  deleteMeeting,
} from "@/server/services/live-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  await requireMeetingWrite(id);
  return ok(await getMeetingDetail(id));
});

export const PATCH = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireMeetingWrite(id);
  const input = updateMeetingSchema.parse(await req.json().catch(() => ({})));
  await updateMeeting(id, input);
  return ok({ message: "Live class saved." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  const id = String((await params).id);
  await requireMeetingWrite(id);
  await deleteMeeting(id);
  return ok({ message: "Live class deleted." });
});
