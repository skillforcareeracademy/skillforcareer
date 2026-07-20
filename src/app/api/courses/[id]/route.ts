import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission, requireCourseWrite } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { updateCourseSchema } from "@/lib/validations/course";
import { updateCourse, deleteCourse } from "@/server/services/course-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireCourseWrite(id);
  const input = updateCourseSchema.parse(await req.json().catch(() => ({})));
  await updateCourse(id, input);
  return ok({ message: "Course saved." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.DELETE_ANY_COURSE);
  const id = String((await params).id);
  await deleteCourse(id);
  return ok({ message: "Course deleted." });
});
