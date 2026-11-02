import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiLeadAccess } from "@/lib/auth/api-guard";
import { followUpSchema } from "@/lib/validations/lead";
import { addFollowUp } from "@/server/services/lead-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  const { user } = await requireApiLeadAccess(id, { write: true });
  const input = followUpSchema.parse(await req.json().catch(() => ({})));
  const followUpId = await addFollowUp(id, input, user.id);
  return created({ id: followUpId, message: "Follow-up added." });
});
