import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { setPaymentStatusSchema } from "@/lib/validations/payment";
import { getPaymentDetail, setPaymentStatus, deletePayment } from "@/server/services/payment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PAYMENTS);
  const id = String((await params).id);
  return ok(await getPaymentDetail(id));
});

export const PATCH = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PAYMENTS);
  const id = String((await params).id);
  const { status } = setPaymentStatusSchema.parse(await req.json().catch(() => ({})));
  await setPaymentStatus(id, status);
  return ok({ message: "Payment updated." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PAYMENTS);
  const id = String((await params).id);
  await deletePayment(id);
  return ok({ message: "Payment deleted." });
});
