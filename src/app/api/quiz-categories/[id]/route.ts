import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { quizCategorySchema } from "@/lib/validations/quiz";
import { deleteQuizCategory, renameQuizCategory } from "@/server/services/quiz-category-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_QUIZ);
  const id = String((await params).id);
  const { name } = quizCategorySchema.parse(await req.json().catch(() => ({})));
  await renameQuizCategory(id, name);
  return ok({ message: "Renamed." });
});

/** Deleting a group leaves its quizzes ungrouped — never deletes a paper. */
export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_QUIZ);
  await deleteQuizCategory(String((await params).id));
  return ok({ message: "Deleted. The quizzes in it are now ungrouped." });
});
