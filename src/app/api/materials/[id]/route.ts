import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiPermission, userOwnsCourse } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { studyMaterialSchema } from "@/lib/validations/study-material";
import {
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
  const input = studyMaterialSchema.parse(await req.json().catch(() => ({})));
  if (input.courseId && !(await userOwnsCourse(user, input.courseId))) {
    throw AppError.forbidden("You can only file material under your own courses.");
  }
  await updateMaterial(id, input);
  return ok({ message: "Material updated." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  await deleteMaterial(String((await params).id));
  return ok({ message: "Material deleted." });
});
