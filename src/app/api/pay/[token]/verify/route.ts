import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { linkCheckoutVerifySchema } from "@/lib/validations/lead-payment";
import { verifyLinkCheckout } from "@/server/services/lead-payment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public: confirm a link payment from the browser. The Razorpay signature is
 * checked server-side, and the webhook remains the authoritative path — this
 * only exists so the payer sees "paid" without waiting for it.
 */
export const POST = withRoute(async (req, { params }) => {
  const token = String((await params).token);
  const input = linkCheckoutVerifySchema.parse(await req.json().catch(() => ({})));
  return ok(await verifyLinkCheckout(token, input));
});
