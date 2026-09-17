import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { getLearningStats, getMyLearning } from "@/server/services/enrollment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/student/courses — the learner's own enrolments.
 *
 * The website renders My Learning on the server, so the Android and iOS apps
 * had no way to read it. These `/api/student/*` routes are thin wrappers over
 * the same service functions those pages call: no second copy of the rules, and
 * a learner can only ever see their own row because the session decides whose.
 */
export const GET = withRoute(async () => {
  const user = await requireApiUser();
  const [stats, courses] = await Promise.all([
    getLearningStats(user.id),
    getMyLearning(user.id),
  ]);
  return ok({ stats, courses });
});
