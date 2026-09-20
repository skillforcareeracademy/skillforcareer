import { withRoute } from "@/lib/api/handler";
import { AppError } from "@/lib/api/errors";
import { requireApiPermission, isStaffRole } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { csvResponse } from "@/lib/csv";
import {
  resolveAnalyticsWindow,
  getAnalyticsSummary,
  analyticsReportCsv,
  analyticsReportFilename,
} from "@/server/services/analytics-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The analytics page's report for one period, as a CSV:
 * `?from=YYYY-MM-DD&to=YYYY-MM-DD` (IST days, inclusive), or `?range=7|30|90`.
 * Platform-wide revenue, so staff only — the same people who can open the page,
 * even though instructors also hold `analytics:view` for their own dashboards.
 */
export const GET = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.VIEW_ANALYTICS);
  // Same people as the page's `requireRole([SUPER_ADMIN, ADMIN])`, which also
  // admits someone who holds an admin role as an extra role.
  if (!isStaffRole(user.role) && !user.roles.some(isStaffRole)) {
    throw AppError.forbidden("Only admins can download the analytics report.");
  }

  const sp = new URL(req.url).searchParams;
  const { period, error } = resolveAnalyticsWindow({
    from: sp.get("from"),
    to: sp.get("to"),
    range: sp.get("range"),
  });
  if (error) throw AppError.badRequest(error);

  const summary = await getAnalyticsSummary(period);
  return csvResponse(analyticsReportFilename(period), analyticsReportCsv(summary));
});
