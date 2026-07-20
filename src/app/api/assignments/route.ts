import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiPermission, userOwnsCourse } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { createAssignmentSchema } from "@/lib/validations/assignment";
import { createAssignment } from "@/server/services/assignment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.GRADE_ASSIGNMENT);
  const input = createAssignmentSchema.parse(await req.json().catch(() => ({})));
  // Instructors may only add assignments to their own courses.
  if (!(await userOwnsCourse(user, input.courseId ?? null))) {
    throw AppError.forbidden("You can only add assignments to your own courses.");
  }
  const id = await createAssignment(input, user.id);
  return created({ id, message: "Assignment created." });
});
