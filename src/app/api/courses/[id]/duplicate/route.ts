import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { duplicateCourse } from "@/server/services/course-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Copy a course, its chapters and its lessons into a fresh draft. */
export const POST = withRoute(async (_req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.CREATE_COURSE);
  const id = await duplicateCourse(String((await params).id), user.id);
  return created({ id, message: "Copied. The copy is a draft." });
});
