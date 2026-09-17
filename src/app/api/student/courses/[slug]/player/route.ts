import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api-guard";
import { getCoursePlayer } from "@/server/services/learning-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/student/courses/[slug]/player — curriculum, progress and lock state. */
export const GET = withRoute(async (_req, ctx) => {
  const user = await requireApiUser();
  const { slug } = (await ctx.params) as { slug: string };
  const player = await getCoursePlayer(user.id, slug);
  if (!player) throw AppError.notFound("This course isn't open for you.");
  return ok(player);
});
