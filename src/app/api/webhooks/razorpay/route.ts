import { withRoute } from "@/lib/api/handler";
import { ok, fail } from "@/lib/api/response";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { handleRazorpayWebhook } from "@/server/services/payment-service";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Razorpay webhook — the authoritative "money actually moved" signal. Public by
 * necessity, so trust comes entirely from the HMAC signature over the RAW body.
 * Verify before parsing; a bad or missing signature is rejected with 400.
 */
export const POST = withRoute(async (req) => {
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(raw, signature)) {
    logger.warn("razorpay.webhook_bad_signature");
    return fail("UNAUTHORIZED", "Invalid webhook signature.", 400);
  }

  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return fail("VALIDATION_ERROR", "Invalid JSON.", 400);
  }

  const { handled } = await handleRazorpayWebhook(event);
  return ok({ received: true, handled });
});
