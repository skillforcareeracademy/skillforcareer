import { withRoute } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { materialCategorySchema } from "@/lib/validations/study-material";
import {
  createMaterialCategory,
  listMaterialCategories,
} from "@/server/services/material-category-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async () => {
  await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  return ok({ categories: await listMaterialCategories() });
});

export const POST = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  const input = materialCategorySchema.parse(await req.json().catch(() => ({})));
  const id = await createMaterialCategory(input);
  return created({ id, message: input.parentId ? "Sub-category added." : "Category added." });
});
