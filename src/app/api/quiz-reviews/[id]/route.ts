import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { answerReviewSchema } from "@/lib/validations/question-review";
import { answerQuestionReview } from "@/server/services/question-review-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The admin or instructor answers a review request. */
export const PATCH = withRoute(async (req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_QUIZ);
  const id = String((await params).id);
  const input = answerReviewSchema.parse(await req.json().catch(() => ({})));
  await answerQuestionReview(id, user.id, input);
  return ok({ message: "The learner has been told." });
});
