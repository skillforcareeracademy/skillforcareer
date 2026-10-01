import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { broadcastOptions, senderFrom } from "@/server/services/broadcast-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The audiences, roles, batches and courses this sender may choose from. */
export const GET = withRoute(async () => {
  const user = await requireApiPermission(PERMISSIONS.SEND_BROADCAST);
  return ok(await broadcastOptions(senderFrom(user)));
});
