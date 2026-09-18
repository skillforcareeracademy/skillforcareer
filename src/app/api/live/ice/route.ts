import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { buildIceConfig } from "@/lib/live/ice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/live/ice — STUN/TURN servers for a live room.
 *
 * The room asks for this just before it opens its first peer connection, so a
 * TURN host (or a rotated credential) takes effect on the next join rather than
 * the next deploy. Signed-in callers only: a minted coturn credential is worth
 * real relay bandwidth.
 */
export const GET = withRoute(async () =>
  ok(buildIceConfig((await requireApiUser()).id)),
);
