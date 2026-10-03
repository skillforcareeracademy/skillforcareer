import { withRoute } from "@/lib/api/handler";
import { created, ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { boardListSchema, boardSlideSchema } from "@/lib/validations/board";
import { createSlide, listSlides } from "@/server/services/board-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Saved pages, filtered by class, batch or course. */
export const GET = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.HOST_LIVE_CLASS);
  const sp = new URL(req.url).searchParams;
  const q = boardListSchema.parse(Object.fromEntries(sp.entries()));
  return ok(await listSlides(q, { id: user.id, roles: user.roles }));
});

/** Keep the page as it stands. */
export const POST = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.HOST_LIVE_CLASS);
  const input = boardSlideSchema.parse(await req.json().catch(() => ({})));
  const id = await createSlide(input, user.id);
  return created({ id, message: `“${input.title}” saved.` });
});
