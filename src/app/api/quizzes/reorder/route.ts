import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS, ROLES } from "@/config/roles";
import { reorderQuizzesSchema } from "@/lib/validations/quiz";
import { reorderQuizzes } from "@/server/services/quiz-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Renumber a group of quizzes 1…n. The body is the ids in their new order —
 * the same shape the question reorder takes.
 */
export const PATCH = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_QUIZ);
  const { ids } = reorderQuizzesSchema.parse(await req.json().catch(() => ({})));
  const staff = user.roles.some((r) => r === ROLES.SUPER_ADMIN || r === ROLES.ADMIN);
  const count = await reorderQuizzes(ids, staff ? undefined : user.id);
  return ok({ count, message: "Order saved." });
});
