import { withRoute } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { toCsv, csvResponse } from "@/lib/csv";
import { partnersForExport } from "@/server/services/careers-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The hiring-partners list as a spreadsheet, in the columns the importer reads back. */
export const GET = withRoute(async () => {
  await requireApiPermission(PERMISSIONS.MANAGE_PLACEMENTS);
  const { headers, data } = await partnersForExport("hiring");
  const stamp = new Date().toISOString().slice(0, 10);
  return csvResponse(`hiring-partners-${stamp}.csv`, toCsv(headers, data));
});
