import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { listWebinarsForStudent } from "@/server/services/webinar-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/student/webinars — published webinars, with this learner's seat. */
export const GET = withRoute(async () => {
  const user = await requireApiUser();
  return ok(await listWebinarsForStudent(user.id, user.email));
});
