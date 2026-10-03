import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { toggleTermBookmark } from "@/server/services/term-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Save a word for later, or stop saving it. */
export const POST = withRoute(async (_req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  const { saved } = await toggleTermBookmark(id, user.id);
  return ok({ saved, message: saved ? "Saved for later." : "Removed from your words." });
});
