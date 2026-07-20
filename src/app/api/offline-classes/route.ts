import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { offlineClassSchema } from "@/lib/validations/live";
import { createOfflineClass } from "@/server/services/live-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.HOST_LIVE_CLASS);
  const input = offlineClassSchema.parse(await req.json().catch(() => ({})));
  const id = await createOfflineClass(input, user.id);
  return created({ id, message: "Offline class created." });
});
