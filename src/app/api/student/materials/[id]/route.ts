import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api-guard";
import { getMaterialForLearner } from "@/server/services/material-learner-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One piece, its text, and this learner's own marks on it. */
export const GET = withRoute(async (_req, { params }) => {
  const user = await requireApiUser();
  const material = await getMaterialForLearner(user.id, String((await params).id));
  if (!material) throw AppError.notFound("That material isn't available to you.");
  return ok({ material });
});
