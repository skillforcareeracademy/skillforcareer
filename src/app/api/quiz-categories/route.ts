import { withRoute } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { quizCategorySchema } from "@/lib/validations/quiz";
import { createQuizCategory, listQuizCategories } from "@/server/services/quiz-category-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The quiz groups, as a category → sub-category tree with quiz counts. */
export const GET = withRoute(async () => {
  await requireApiPermission(PERMISSIONS.MANAGE_QUIZ);
  return ok({ categories: await listQuizCategories() });
});

export const POST = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_QUIZ);
  const input = quizCategorySchema.parse(await req.json().catch(() => ({})));
  const id = await createQuizCategory(input);
  return created({ id, message: input.parentId ? "Sub-category added." : "Category added." });
});
