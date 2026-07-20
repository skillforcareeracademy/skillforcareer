import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { markRead } from "@/server/services/notification-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (_req, { params }) => {
  const user = await requireApiUser();
  // Scoped to the caller inside the service — one user cannot mark another's.
  await markRead(user.id, String((await params).id));
  return ok({ message: "Marked as read." });
});
