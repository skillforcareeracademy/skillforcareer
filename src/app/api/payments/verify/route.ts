import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { verifyAndFulfillCheckout } from "@/server/services/payment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  paymentId: z.string().min(1),
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

/**
 * Fast-path fulfilment from the browser after checkout succeeds. The webhook is
 * still the source of truth; this just lets us enrol the learner immediately
 * instead of waiting for the server-to-server callback. Idempotent.
 */
export const POST = withRoute(async (req) => {
  await requireApiUser();
  const input = bodySchema.parse(await req.json().catch(() => ({})));
  const { slug } = await verifyAndFulfillCheckout(input);
  return ok({ slug, message: "Payment confirmed." });
});
