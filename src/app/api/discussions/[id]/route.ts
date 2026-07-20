import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import {
  requireApiUser,
  requireDiscussionModerate,
  canModerateDiscussion,
} from "@/lib/auth/api-guard";
import { moderateThreadSchema } from "@/lib/validations/discussion";
import { getThreadDetail, moderateThread, deleteDiscussion } from "@/server/services/discussion-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (_req, { params }) => {
  await requireApiUser();
  const id = String((await params).id);
  return ok(await getThreadDetail(id));
});

// Moderation (pin / resolve): staff, or the course's instructor.
export const PATCH = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  await requireDiscussionModerate(id);
  const input = moderateThreadSchema.parse(await req.json().catch(() => ({})));
  await moderateThread(id, input);
  return ok({ message: "Updated." });
});

// Moderators delete any thread in their scope; authors delete their own.
export const DELETE = withRoute(async (_req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  const canModerate = await canModerateDiscussion(user, id);
  await deleteDiscussion(id, user.id, canModerate);
  return ok({ message: "Deleted." });
});
