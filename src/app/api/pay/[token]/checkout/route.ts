import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { startLinkCheckout } from "@/server/services/lead-payment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public: open a Razorpay order for a payment link.
 *
 * No session — the token *is* the credential, and it addresses one payment for
 * one amount that the caller cannot influence. The worst a leaked link allows
 * is paying somebody else's invoice.
 */
export const POST = withRoute(async (_req, { params }) => {
  const token = String((await params).token);
  return ok(await startLinkCheckout(token));
});
