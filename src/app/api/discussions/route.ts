import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { ROLES } from "@/config/roles";
import { createThreadSchema } from "@/lib/validations/discussion";
import { createThread } from "@/server/services/discussion-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req) => {
  const user = await requireApiUser();
  const { courseId, title, body } = createThreadSchema.parse(await req.json().catch(() => ({})));
  const isStaff = user.role === ROLES.SUPER_ADMIN || user.role === ROLES.ADMIN;
  const id = await createThread(user.id, courseId, title, body, isStaff);
  return created({ id, message: "Question posted." });
});
