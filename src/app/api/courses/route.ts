import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { createCourseSchema } from "@/lib/validations/course";
import { createCourse } from "@/server/services/course-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.CREATE_COURSE);
  const input = createCourseSchema.parse(await req.json().catch(() => ({})));
  const id = await createCourse(input, user.id);
  return created({ id, message: "Course created." });
});
