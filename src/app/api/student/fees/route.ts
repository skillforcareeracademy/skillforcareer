import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { getStudentFees } from "@/server/services/student-payment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/student/fees — what the learner has paid and still owes.
 * Read-only: paying happens on the website, never inside the apps.
 */
export const GET = withRoute(async () => ok(await getStudentFees((await requireApiUser()).id)));
