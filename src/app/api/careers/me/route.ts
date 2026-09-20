import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/api-guard";
import { ROLES } from "@/config/roles";
import { getApplicantPrefill } from "@/server/services/careers-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public: what the CV form can fill in for the visitor. Signed-in learners get
 * their name, contact details and enrolled courses with batch; everyone else
 * gets `null` and a blank form.
 *
 * Fetched by the form rather than read while rendering the page: the proxy only
 * renews an expired access token on `/api` and dashboard requests, so a learner
 * whose token lapsed would look signed out to a marketing page's render.
 */
export const GET = withRoute(async () => {
  const user = await getSessionUser();
  if (!user || user.role !== ROLES.STUDENT) return ok(null);
  return ok(await getApplicantPrefill(user.id));
});
