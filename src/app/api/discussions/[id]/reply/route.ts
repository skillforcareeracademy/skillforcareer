import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiUser, canModerateDiscussion } from "@/lib/auth/api-guard";
import { replySchema } from "@/lib/validations/discussion";
import { createReply } from "@/server/services/discussion-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  const { body } = replySchema.parse(await req.json().catch(() => ({})));
  // Staff and the course's instructor may reply without being enrolled.
  const elevated = await canModerateDiscussion(user, id);
  const replyId = await createReply(id, user.id, body, elevated);
  return created({ id: replyId, message: "Reply posted." });
});
