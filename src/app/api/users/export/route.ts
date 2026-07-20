import { withRoute } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { toCsv, csvResponse } from "@/lib/csv";
import { usersForExport } from "@/server/services/user-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_USERS);
  const sp = new URL(req.url).searchParams;
  const { headers, data } = await usersForExport({
    search: sp.get("search") || undefined,
    role: sp.get("role") || undefined,
    status: sp.get("status") || undefined,
    page: 1,
    pageSize: 10000,
  });
  const stamp = new Date().toISOString().slice(0, 10);
  return csvResponse(`users-${stamp}.csv`, toCsv(headers, data));
});
