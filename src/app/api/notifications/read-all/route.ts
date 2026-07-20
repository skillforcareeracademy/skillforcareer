import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { markAllRead } from "@/server/services/notification-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async () => {
  const user = await requireApiUser();
  const count = await markAllRead(user.id);
  return ok({ count });
});
