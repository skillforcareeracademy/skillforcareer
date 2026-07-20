import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { refundSchema } from "@/lib/validations/payment";
import { issueRefund } from "@/server/services/payment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PAYMENTS);
  const id = String((await params).id);
  const input = refundSchema.parse(await req.json().catch(() => ({})));
  await issueRefund(id, input);
  return created({ message: "Refund issued." });
});
