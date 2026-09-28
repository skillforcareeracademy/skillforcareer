import { withRoute } from "@/lib/api/handler";
import { requireApiStaff } from "@/lib/auth/api-guard";
import { csvResponse, toCsv } from "@/lib/csv";
import { reportCardFor, reportCardCsv } from "@/server/services/performance-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/students/<id>/report-card — the course-wise card as a CSV.
 * One row per course, so a batch of them can be pasted into one sheet.
 */
export const GET = withRoute(async (_req, { params }) => {
  await requireApiStaff();
  const id = String((await params).id);
  const { learner, card } = await reportCardFor(id);
  const { headers, rows } = reportCardCsv(learner, card);
  const safeName = learner.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return csvResponse(`report-card-${safeName}.csv`, toCsv(headers, rows));
});
