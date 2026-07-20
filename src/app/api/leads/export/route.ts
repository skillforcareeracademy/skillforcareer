import { withRoute } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { toCsv, csvResponse } from "@/lib/csv";
import { leadsForExport } from "@/server/services/lead-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_LEADS);
  const sp = new URL(req.url).searchParams;
  const { headers, data } = await leadsForExport({
    search: sp.get("search") || undefined,
    status: sp.get("status") || undefined,
    source: sp.get("source") || undefined,
  });
  const stamp = new Date().toISOString().slice(0, 10);
  return csvResponse(`leads-${stamp}.csv`, toCsv(headers, data));
});
