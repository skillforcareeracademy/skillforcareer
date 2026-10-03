import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { assignmentAttemptDetail } from "@/server/services/attempt-history-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One assignment attempt, question by question. */
export const GET = withRoute(async (_req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  return ok(await assignmentAttemptDetail(id, { id: user.id, roles: user.roles }));
});
