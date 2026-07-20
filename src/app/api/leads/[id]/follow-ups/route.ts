import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { followUpSchema } from "@/lib/validations/lead";
import { addFollowUp } from "@/server/services/lead-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_LEADS);
  const id = String((await params).id);
  const input = followUpSchema.parse(await req.json().catch(() => ({})));
  const followUpId = await addFollowUp(id, input, user.id);
  return created({ id: followUpId, message: "Follow-up added." });
});
