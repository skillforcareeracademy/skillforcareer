import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiPermission, isStaffRole, userOwnsCourse } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { createBatchSchema } from "@/lib/validations/batch";
import { createBatch } from "@/server/services/batch-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_BATCHES);
  const input = createBatchSchema.parse(await req.json().catch(() => ({})));
  // Instructors lead their own batches and only on their own courses.
  if (!isStaffRole(user.role)) {
    if (!(await userOwnsCourse(user, input.courseId))) {
      throw AppError.forbidden("You can only create batches for your own courses.");
    }
    input.instructorId = user.id;
  }
  const id = await createBatch(input);
  return created({ id, message: "Batch created." });
});
