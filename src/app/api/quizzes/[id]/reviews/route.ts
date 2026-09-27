import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { raiseReviewSchema } from "@/lib/validations/question-review";
import { raiseQuestionReview } from "@/server/services/question-review-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A learner flags a question as wrong. Open to anyone signed in — the review
 *  itself records who raised it, and the team decides. */
export const POST = withRoute(async (req, { params }) => {
  const user = await requireApiUser();
  const quizId = String((await params).id);
  const input = raiseReviewSchema.parse(await req.json().catch(() => ({})));
  const review = await raiseQuestionReview(user.id, quizId, input);
  return created(review);
});
