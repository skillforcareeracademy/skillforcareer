import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { broadcastPeople, senderFrom } from "@/server/services/broadcast-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** People to pick for the "chosen people" audience, narrowed by a search. */
export const GET = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.SEND_BROADCAST);
  const search = new URL(req.url).searchParams.get("q") ?? "";
  return ok({ people: await broadcastPeople(senderFrom(user), search) });
});
