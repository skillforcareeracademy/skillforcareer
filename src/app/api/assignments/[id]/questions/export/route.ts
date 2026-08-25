import { withRoute } from "@/lib/api/handler";
import { AppError } from "@/lib/api/errors";
import { requireApiPermission, isStaffRole } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { exportAssignmentQuestions } from "@/server/services/assignment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Download the question bank as JSON.
 *
 * Staff only: an export carries every model answer and correct option, so it is
 * the answer key. Instructors can import a paper but not take one away.
 */
export const GET = withRoute(async (_req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.GRADE_ASSIGNMENT);
  if (!isStaffRole(user.role)) {
    throw AppError.forbidden("Only admins can export questions.");
  }
  const id = String((await params).id);
  const data = await exportAssignmentQuestions(id);

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="assignment-${id}-questions.json"`,
    },
  });
});
