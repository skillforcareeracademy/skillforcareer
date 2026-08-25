import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { recordWebinarAttendance } from "@/server/services/webinar-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  roomCode: z.string().trim().min(3).max(64),
  seconds: z.coerce.number().int().min(0).max(24 * 60 * 60),
});

/**
 * POST /api/webinars/presence — heartbeat from the webinar room.
 *
 * This is what turns "we ran a webinar" into "these people attended, for this
 * long", without anyone ticking a register. Keyed on the room code rather than
 * the webinar id so the room component needs to know nothing extra.
 */
export const POST = withRoute(async (req) => {
  const user = await requireApiUser();
  const { roomCode, seconds } = bodySchema.parse(await req.json().catch(() => ({})));
  const result = await recordWebinarAttendance(roomCode, user.id, seconds);
  // Not a webinar room (an ordinary live class) — nothing to record.
  if (!result) return ok({ tracked: false });
  return ok({ tracked: true, ...result });
});
