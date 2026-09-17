import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { createWatermarkOrder } from "@/server/services/payment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/recordings/:meetingId/watermark/checkout — start a Razorpay order
 * for taking the overlay off one recording.
 *
 * There is no twin "verify" route: the reply is the same `CheckoutSession` shape
 * the course buy box uses, so the browser confirms it through the existing
 * `POST /api/payments/verify`, and the Razorpay webhook fulfils it through the
 * existing `fulfillPaidCheckout`. The waiver itself is written from the payment's
 * `metadata.kind`, so whichever of the two lands first does the work and the
 * other is a no-op.
 */
export const POST = withRoute(async (_req, { params }) => {
  const { meetingId } = (await params) as { meetingId: string };
  const user = await requireApiUser();
  return ok(await createWatermarkOrder(user, String(meetingId)));
});
