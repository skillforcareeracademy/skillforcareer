import { withRoute } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { toCsv, csvResponse } from "@/lib/csv";
import { leadReport } from "@/server/services/lead-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Summary report over the list's current filters — counts by stage, status… */
export const GET = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_LEADS);
  const sp = new URL(req.url).searchParams;
  const param = (key: string) => sp.get(key) || undefined;

  const { headers, data } = await leadReport({
    search: param("search"),
    stage: param("stage"),
    subStatus: param("subStatus"),
    source: param("source"),
    classMode: param("classMode"),
    courseId: param("courseId"),
    assignedToId: param("assignedToId"),
    quality: param("quality"),
    minScore: param("minScore"),
    due: param("due"),
    from: param("from"),
    to: param("to"),
  });
  const stamp = new Date().toISOString().slice(0, 10);
  return csvResponse(`lead-report-${stamp}.csv`, toCsv(headers, data));
});
