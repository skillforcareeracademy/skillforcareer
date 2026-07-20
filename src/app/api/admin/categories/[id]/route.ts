import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { categorySchema } from "@/lib/validations/category";
import { updateCategory, deleteCategory } from "@/server/services/category-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_CATEGORIES);
  const id = String((await params).id);
  const input = categorySchema.parse(await req.json().catch(() => ({})));
  await updateCategory(id, input);
  return ok({ message: "Category updated." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_CATEGORIES);
  const id = String((await params).id);
  await deleteCategory(id);
  return ok({ message: "Category deleted." });
});
