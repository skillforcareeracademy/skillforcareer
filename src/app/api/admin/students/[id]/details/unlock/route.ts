import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api-guard";
import { unlockStudentDetail } from "@/server/services/student-detail-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/students/:id/details/unlock — re-open a submitted profile so
 * the learner can edit it again.
 */
export const POST = withRoute(async (_req, { params }) => {
  await requireApiStaff();
  const id = String((await params).id);
  const view = await unlockStudentDetail(id);
  return ok({ ...view, message: "Unlocked — the learner can edit their details again." });
});
