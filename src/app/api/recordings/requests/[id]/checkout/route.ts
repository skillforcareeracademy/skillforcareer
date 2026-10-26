import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { createRecordingAccessOrder } from "@/server/services/payment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/recordings/requests/:id/checkout — start a Razorpay order for the
 * recording a super admin priced and shared. Like the watermark checkout, the
 * reply is a CheckoutSession the browser confirms through /api/payments/verify;
 * the webhook (or that callback) grants access from the payment metadata.
 */
export const POST = withRoute(async (_req, { params }) => {
  const user = await requireApiUser();
  const { id } = (await params) as { id: string };
  return ok(await createRecordingAccessOrder(user, String(id)));
});
