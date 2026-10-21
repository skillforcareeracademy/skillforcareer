import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiPermission, userOwnsCourse } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { studyMaterialSchema } from "@/lib/validations/study-material";
import {
  assertCanEditMaterial,
  deleteMaterial,
  getMaterial,
  updateMaterial,
} from "@/server/services/study-material-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  const material = await getMaterial(String((await params).id));
  if (!material) throw AppError.notFound("Material not found.");
  return ok({ material });
});

export const PATCH = withRoute(async (req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  const id = String((await params).id);
  const { courseId: currentCourseId } = await assertCanEditMaterial(user, id);
  const input = studyMaterialSchema.parse(await req.json().catch(() => ({})));
  // Editing in place may keep a course the instructor doesn't lead (an admin's
  // batch note); only *moving* it to a different course needs ownership.
  const movingCourse =
    Boolean(input.courseId) && input.courseId !== currentCourseId;
  if (movingCourse && !(await userOwnsCourse(user, input.courseId!))) {
    throw AppError.forbidden("You can only file material under your own courses.");
  }
  await updateMaterial(id, input);
  return ok({ message: "Material updated." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  const id = String((await params).id);
  await assertCanEditMaterial(user, id);
  await deleteMaterial(id, user.id);
  return ok({ message: "Material deleted." });
});
