import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/api-guard";
import { ROLES } from "@/config/roles";
import { getApplicantPrefill } from "@/server/services/careers-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public: whether the visitor may apply, and what the CV form can fill in for
 * them. Signed-in learners get their name, contact details and enrolled courses
 * with batch; everyone else gets a blank form.
 *
 * `signedIn` is separate from `applicant` because applying now needs an account
 * — "no one can apply for job from outside form without registration" — and the
 * form has to tell "not registered" apart from "registered, nothing to prefill".
 *
 * Fetched by the form rather than read while rendering the page: the proxy only
 * renews an expired access token on `/api` and dashboard requests, so a learner
 * whose token lapsed would look signed out to a marketing page's render.
 */
export const GET = withRoute(async () => {
  const user = await getSessionUser();
  if (!user) return ok({ signedIn: false, applicant: null });
  if (user.role !== ROLES.STUDENT) return ok({ signedIn: true, applicant: null });
  return ok({ signedIn: true, applicant: await getApplicantPrefill(user.id) });
});
