import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { emptyTrash, listTrash } from "@/server/services/trash-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What this person can put back. Staff see the whole bin. */
export const GET = withRoute(async (req) => {
  const user = await requireApiUser();
  const page = Number(new URL(req.url).searchParams.get("page") ?? 1) || 1;
  return ok(await listTrash({ id: user.id, roles: user.roles }, page));
});

/** Empty everything this person can see. */
export const DELETE = withRoute(async () => {
  const user = await requireApiUser();
  const removed = await emptyTrash({ id: user.id, roles: user.roles });
  return ok({
    removed,
    message:
      removed === 0
        ? "The recycle bin was already empty."
        : `Emptied ${removed} item${removed === 1 ? "" : "s"} for good.`,
  });
});
