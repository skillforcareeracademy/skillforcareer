import { withRoute } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { categorySchema } from "@/lib/validations/category";
import { listCategories, createCategory } from "@/server/services/category-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async () => {
  await requireApiPermission(PERMISSIONS.MANAGE_CATEGORIES);
  return ok(await listCategories());
});

export const POST = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_CATEGORIES);
  const input = categorySchema.parse(await req.json().catch(() => ({})));
  await createCategory(input);
  return created({ message: "Category created." });
});
