import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { boardSlideSchema } from "@/lib/validations/board";
import { deleteSlide, getSlide, updateSlide } from "@/server/services/board-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One page, with the strokes needed to draw it again. */
export const GET = withRoute(async (_req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.HOST_LIVE_CLASS);
  const id = String((await params).id);
  return ok(await getSlide(id, { id: user.id, roles: user.roles }));
});

export const PATCH = withRoute(async (req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.HOST_LIVE_CLASS);
  const id = String((await params).id);
  const input = boardSlideSchema.parse(await req.json().catch(() => ({})));
  await updateSlide(id, input, { id: user.id, roles: user.roles });
  return ok({ message: "Saved." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.HOST_LIVE_CLASS);
  const id = String((await params).id);
  await deleteSlide(id, { id: user.id, roles: user.roles });
  return ok({ message: "Deleted." });
});
