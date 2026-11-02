import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiLeadAccess } from "@/lib/auth/api-guard";
import { leadContactSchema } from "@/lib/validations/lead";
import { logLeadContact } from "@/server/services/lead-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/leads/[id]/contact — log an outreach attempt and return the link
 * the counsellor's device should open (`tel:`, `wa.me`, `sms:`).
 *
 * The browser can't be trusted to report who dialled — the session can. The
 * signed-in user is the agent on the record, so the report of "who chased this
 * lead" is the platform's own, not something a client can spoof.
 */
export const POST = withRoute(async (req, { params }) => {
  const id = String((await params).id);
  const { user } = await requireApiLeadAccess(id, { write: true });
  const { channel } = leadContactSchema.parse(await req.json().catch(() => ({})));
  return created(await logLeadContact(id, user.id, channel));
});
