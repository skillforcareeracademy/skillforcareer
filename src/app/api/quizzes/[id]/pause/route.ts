import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { pauseQuizSchema } from "@/lib/validations/quiz";
import {
  discardPausedWork,
  pauseQuizAttempt,
} from "@/server/services/student-quiz-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Save a half-finished paper so it can be picked up later. */
export const POST = withRoute(async (req, { params }) => {
  const user = await requireApiUser();
  const quizId = String((await params).id);
  const input = pauseQuizSchema.parse(await req.json().catch(() => ({})));
  const res = await pauseQuizAttempt(user.id, quizId, input);
  return ok({ ...res, message: "Saved — pick it up whenever you like." });
});

/** Throw the paused paper away and start fresh. */
export const DELETE = withRoute(async (_req, { params }) => {
  const user = await requireApiUser();
  await discardPausedWork(user.id, String((await params).id));
  return ok({ message: "Starting again." });
});
