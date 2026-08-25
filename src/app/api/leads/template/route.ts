import { withRoute } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { toCsv, csvResponse } from "@/lib/csv";
import { leadImportTemplate } from "@/server/services/lead-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A one-row sample sheet so the client can see the headers import expects. */
export const GET = withRoute(async () => {
  await requireApiPermission(PERMISSIONS.MANAGE_LEADS);
  const { headers, data } = leadImportTemplate();
  return csvResponse("leads-import-template.csv", toCsv(headers, data));
});
