import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireMeetingWrite } from "@/lib/auth/api-guard";
import { MEETING_STATUSES } from "@/lib/validations/live";
import { setMeetingStatus } from "@/server/services/live-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ status: z.enum(MEETING_STATUSES) });

export const POST = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireMeetingWrite(id);
  const { status } = bodySchema.parse(await req.json().catch(() => ({})));
  const { notified } = await setMeetingStatus(id, status);
  return ok({ message: "Status updated.", notified });
});
