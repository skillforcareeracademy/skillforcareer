import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { toggleQuizBookmark } from "@/server/services/learning-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Save or unsave the whole quiz. Singular, and a toggle, because a quiz-level
 * bookmark carries no timestamp — there is only ever one per learner, so the
 * button that sets it is the same button that clears it.
 */
export const POST = withRoute(async (_req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  const { saved } = await toggleQuizBookmark(user.id, id);
  return ok({ saved, message: saved ? "Saved for later." : "Removed from saved." });
});
