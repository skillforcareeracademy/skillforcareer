import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { purgeFromTrash, restoreFromTrash } from "@/server/services/trash-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — put it back where it was. */
export const POST = withRoute(async (_req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  const message = await restoreFromTrash({ id: user.id, roles: user.roles }, id);
  return ok({ message });
});

/** DELETE — throw it away for good. */
export const DELETE = withRoute(async (_req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  await purgeFromTrash({ id: user.id, roles: user.roles }, id);
  return ok({ message: "Deleted for good." });
});
