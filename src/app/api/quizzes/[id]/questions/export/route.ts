import { withRoute } from "@/lib/api/handler";
import { AppError } from "@/lib/api/errors";
import { requireApiPermission, isStaffRole } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { exportQuestions } from "@/server/services/quiz-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Download the question bank as JSON.
 *
 * Staff only: the export carries every correct option and model answer, so it
 * is the answer key. Instructors may import a bank but not take one away.
 */
export const GET = withRoute(async (_req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_QUIZ);
  if (!isStaffRole(user.role)) {
    throw AppError.forbidden("Only admins can export questions.");
  }
  const id = String((await params).id);
  const data = await exportQuestions(id);

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="quiz-${id}-questions.json"`,
    },
  });
});
