import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { deleteBookmark } from "@/server/services/learning-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withRoute(async (_req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  await deleteBookmark(user.id, id);
  return ok({ message: "Bookmark removed." });
});
