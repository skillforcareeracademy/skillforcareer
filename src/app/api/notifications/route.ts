import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { getNotificationFeed } from "@/server/services/notification-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The signed-in user's own notifications. Every role has a feed — what differs
 * is only what gets written to it, not who may read one.
 */
export const GET = withRoute(async () => {
  const user = await requireApiUser();
  return ok(await getNotificationFeed(user.id));
});
