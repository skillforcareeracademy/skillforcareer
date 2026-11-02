import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiLeadCreate } from "@/lib/auth/api-guard";
import { createLeadSchema } from "@/lib/validations/lead";
import { createLead } from "@/server/services/lead-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req) => {
  const guard = await requireApiLeadCreate();
  const input = createLeadSchema.parse(await req.json().catch(() => ({})));
  // A sales agent's new lead is assigned to them — that is what makes it theirs
  // to work; an admin may assign it to whoever they chose.
  const assignedToId = guard.all ? input.assignedToId : guard.viewerId;
  const id = await createLead({ ...input, assignedToId }, input.source);
  return created({ id, message: "Lead added." });
});
