import { withRoute } from "@/lib/api/handler";
import { AppError } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { importModeSchema } from "@/lib/validations/import-mode";
import { importTerms } from "@/server/services/term-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** A long dictionary is a lot of rows; give it room. */
export const maxDuration = 300;

/** Bring a dictionary in from a sheet. Matching is on the word and its kind. */
export const POST = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  const csv = await req.text();
  if (!csv.trim()) throw AppError.badRequest("That file is empty.");
  const mode = importModeSchema.parse(
    new URL(req.url).searchParams.get("mode") ?? undefined,
  );
  const result = await importTerms(csv, user.id, mode);
  const parts: string[] = [];
  if (result.created > 0) parts.push(`${result.created} added`);
  if (result.updated > 0) parts.push(`${result.updated} updated`);
  if (result.skipped.length > 0) parts.push(`${result.skipped.length} skipped`);

  // A sheet that looked full but landed nothing is the confusing case, so say
  // which columns were actually found — "if any reason is there for not getting
  // uploaded, that reason should be reflected".
  const nothing =
    result.headers.length > 0
      ? `Nothing could be read. The sheet's columns are ${result.headers.join(", ")} — it needs a Word column and a Meaning column.`
      : "That sheet has no column headings in its first row.";

  return ok({
    ...result,
    message: parts.length > 0 ? `${parts.join(", ")}.` : nothing,
  });
});
