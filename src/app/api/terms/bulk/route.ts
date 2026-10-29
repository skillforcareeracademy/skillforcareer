import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { bulkTermActionSchema } from "@/lib/validations/term";
import {
  bulkDeleteTerms,
  deleteAllTerms,
  removeDuplicateTerms,
  stripCopyTags,
} from "@/server/services/term-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/terms/bulk — staff cleanup: delete selected words, empty the
 * dictionary, or remove duplicates.
 */
export const POST = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_MATERIAL);
  const input = bulkTermActionSchema.parse(await req.json().catch(() => ({})));

  if (input.action === "delete") {
    const removed = await bulkDeleteTerms(input.ids, user.id);
    return ok({
      removed,
      message: `${removed} word${removed === 1 ? "" : "s"} moved to the recycle bin.`,
    });
  }
  if (input.action === "delete-all") {
    const removed = await deleteAllTerms();
    return ok({ removed, message: `Cleared ${removed} word${removed === 1 ? "" : "s"}.` });
  }
  if (input.action === "strip-copy") {
    const cleaned = await stripCopyTags();
    return ok({
      removed: cleaned,
      message:
        cleaned > 0
          ? `Removed the “(copy)” tag from ${cleaned} word${cleaned === 1 ? "" : "s"}.`
          : "No “(copy)” tags to remove.",
    });
  }
  const removed = await removeDuplicateTerms();
  return ok({
    removed,
    message:
      removed > 0
        ? `Removed ${removed} duplicate${removed === 1 ? "" : "s"}.`
        : "No duplicates found.",
  });
});
