import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiStaff } from "@/lib/auth/api-guard";
import { studentBreakdown } from "@/server/services/student-breakdown-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The lists behind a learner's figures — one row per class, quiz, lesson… */
export const GET = withRoute(async (_req, { params }) => {
  await requireApiStaff();
  const id = String((await params).id);
  return ok(await studentBreakdown(id));
});
