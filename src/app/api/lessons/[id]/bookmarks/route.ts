import { withRoute } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { bookmarkSchema } from "@/lib/validations/learning";
import { listBookmarks, addBookmark } from "@/server/services/learning-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (_req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  return ok(await listBookmarks(user.id, id));
});

export const POST = withRoute(async (req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  const input = bookmarkSchema.parse(await req.json().catch(() => ({})));
  const bmId = await addBookmark(user.id, id, input);
  return created({ id: bmId, message: "Bookmark added." });
});
