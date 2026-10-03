import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { importModeSchema } from "@/lib/validations/import-mode";
import { importMaterials } from "@/server/services/study-material-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — a CSV of material. What happens to a title already on file is the
 * academy's choice: replace it, leave it alone, or bring the row in as a
 * separate copy. Categories named in the sheet are created as needed.
 */
export const POST = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw AppError.badRequest("Choose a CSV file.");
  if (file.size > 5 * 1024 * 1024) throw AppError.badRequest("That file is over 5 MB.");
  const mode = importModeSchema.parse(
    new URL(req.url).searchParams.get("mode") ?? undefined,
  );
  const result = await importMaterials(await file.text(), user.id, mode);
  return ok({
    ...result,
    message: `${result.created} added, ${result.updated} updated${
      result.skipped.length ? `, ${result.skipped.length} skipped` : ""
    }.`,
  });
});
