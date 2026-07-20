import { withRoute } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { toCsv, csvResponse } from "@/lib/csv";
import { batchesForExport } from "@/server/services/batch-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_BATCHES);
  const sp = new URL(req.url).searchParams;
  const { headers, data } = await batchesForExport({
    search: sp.get("search") || undefined,
    status: sp.get("status") || undefined,
    courseId: sp.get("course") || undefined,
  });
  const stamp = new Date().toISOString().slice(0, 10);
  return csvResponse(`batches-${stamp}.csv`, toCsv(headers, data));
});
