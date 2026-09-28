import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { importMaterials } from "@/server/services/study-material-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — a CSV of material. A title already on file is updated rather than
 * duplicated, and categories named in the sheet are created as needed.
 */
export const POST = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw AppError.badRequest("Choose a CSV file.");
  if (file.size > 5 * 1024 * 1024) throw AppError.badRequest("That file is over 5 MB.");
  const result = await importMaterials(await file.text(), user.id);
  return ok({
    ...result,
    message: `${result.created} added, ${result.updated} updated${
      result.skipped.length ? `, ${result.skipped.length} skipped` : ""
    }.`,
  });
});
