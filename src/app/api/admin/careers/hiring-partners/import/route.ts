import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { importPartnersSchema } from "@/lib/validations/careers";
import { importPartners } from "@/server/services/careers-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Load the hiring partner list from a spreadsheet. */
export const POST = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PLACEMENTS);
  const input = importPartnersSchema.parse(await req.json().catch(() => ({})));
  return ok(await importPartners("hiring", input));
});
