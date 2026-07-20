import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { recordPaymentSchema } from "@/lib/validations/payment";
import { recordPayment } from "@/server/services/payment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PAYMENTS);
  const input = recordPaymentSchema.parse(await req.json().catch(() => ({})));
  const id = await recordPayment(input);
  return created({ id, message: "Payment recorded." });
});
