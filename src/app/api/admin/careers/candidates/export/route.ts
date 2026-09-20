import { withRoute } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { toCsv, csvResponse } from "@/lib/csv";
import { candidatesForExport } from "@/server/services/careers-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The candidate list under its current filters, as a spreadsheet. */
export const GET = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PLACEMENTS);
  const sp = new URL(req.url).searchParams;
  const param = (key: string) => sp.get(key) || undefined;

  const { headers, data } = await candidatesForExport({
    search: param("search"),
    status: param("status"),
    level: param("level"),
    courseId: param("courseId"),
    mode: param("mode"),
    location: param("location"),
    placementPartnerId: param("placementPartnerId"),
    hiringPartnerId: param("hiringPartnerId"),
  });
  const stamp = new Date().toISOString().slice(0, 10);
  return csvResponse(`candidates-${stamp}.csv`, toCsv(headers, data));
});
