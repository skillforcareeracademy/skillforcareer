import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { createLeadSchema } from "@/lib/validations/lead";
import { createLead } from "@/server/services/lead-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_LEADS);
  const input = createLeadSchema.parse(await req.json().catch(() => ({})));
  const id = await createLead(input, input.source);
  return created({ id, message: "Lead added." });
});
