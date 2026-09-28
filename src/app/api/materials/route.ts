import { withRoute } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiPermission, userOwnsCourse } from "@/lib/auth/api-guard";
import { PERMISSIONS, ROLES } from "@/config/roles";
import { studyMaterialSchema } from "@/lib/validations/study-material";
import { createMaterial, listMaterials } from "@/server/services/study-material-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function staffOf(roles: string[]): boolean {
  return roles.some((r) => r === ROLES.SUPER_ADMIN || r === ROLES.ADMIN);
}

/** GET — the material list, filtered and sorted. Instructors see their own. */
export const GET = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  const url = new URL(req.url);
  const str = (k: string) => url.searchParams.get(k) || undefined;
  const materials = await listMaterials(
    {
      search: str("search"),
      categoryId: str("category"),
      subCategoryId: str("subCategory"),
      courseId: str("course"),
      published: str("published") as "yes" | "no" | undefined,
      sort: str("sort") as "sequence" | "newest" | "title" | "reads" | undefined,
    },
    staffOf(user.roles) ? undefined : user.id,
  );
  return ok({ materials });
});

export const POST = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  const input = studyMaterialSchema.parse(await req.json().catch(() => ({})));
  // An instructor may only file material under a course of their own.
  if (input.courseId && !(await userOwnsCourse(user, input.courseId))) {
    throw AppError.forbidden("You can only add material to your own courses.");
  }
  const id = await createMaterial(input, user.id);
  return created({ id, message: "Material saved." });
});
