import { withRoute } from "@/lib/api/handler";
import { AppError } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { importModeSchema } from "@/lib/validations/import-mode";
import { importQuizzes } from "@/server/services/quiz-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Create or update quizzes from a spreadsheet. Matching is by title. */
export const POST = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_QUIZ);
  const csv = await req.text();
  if (!csv.trim()) throw AppError.badRequest("That file is empty.");

  const mode = importModeSchema.parse(new URL(req.url).searchParams.get("mode") ?? undefined);
  const result = await importQuizzes(csv, user.id, mode);
  const parts: string[] = [];
  if (result.created > 0) parts.push(`${result.created} added`);
  if (result.updated > 0) parts.push(`${result.updated} updated`);
  if (result.skipped.length > 0) parts.push(`${result.skipped.length} skipped`);

  return ok({
    ...result,
    message: parts.length > 0 ? parts.join(", ") + "." : "Nothing in that sheet.",
  });
});
