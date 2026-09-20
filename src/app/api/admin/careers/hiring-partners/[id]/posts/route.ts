import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { hiringPostSchema } from "@/lib/validations/careers";
import { createHiringPost } from "@/server/services/careers-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Add a post (a role this partner is hiring for). */
export const POST = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PLACEMENTS);
  const partnerId = String((await params).id);
  const input = hiringPostSchema.parse(await req.json().catch(() => ({})));
  const id = await createHiringPost(partnerId, input);
  return created({ id, message: "Post added." });
});
