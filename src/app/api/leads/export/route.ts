import { withRoute } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { toCsv, csvResponse } from "@/lib/csv";
import { LEAD_FILTER_KEYS, leadViewFrom } from "@/lib/validations/lead";
import { leadsForExport } from "@/server/services/lead-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The list's current filters and sort, exported with the columns import accepts. */
export const GET = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_LEADS);
  const sp = new URL(req.url).searchParams;
  const view = leadViewFrom((key) => sp.get(key));

  const { headers, data } = await leadsForExport({
    ...view,
    viewerId: user.id,
  });
  const stamp = new Date().toISOString().slice(0, 10);
  const filtered = LEAD_FILTER_KEYS.some((key) => view[key]);
  return csvResponse(
    `leads-${filtered ? "filtered-" : ""}${stamp}.csv`,
    toCsv(headers, data),
  );
});
