import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { leadPaymentLinkSchema } from "@/lib/validations/lead-payment";
import { createLeadPaymentLink } from "@/server/services/lead-payment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Raise a shareable "pay now" URL the lead can open without signing in. */
export const POST = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PAYMENTS);
  const id = String((await params).id);
  const input = leadPaymentLinkSchema.parse(await req.json().catch(() => ({})));
  return created(await createLeadPaymentLink(id, input));
});
