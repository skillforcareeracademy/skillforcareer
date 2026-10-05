import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import {
  setPaymentStatusSchema,
  updatePaymentSchema,
} from "@/lib/validations/payment";
import {
  getPaymentDetail,
  setPaymentStatus,
  updatePayment,
  deletePayment,
} from "@/server/services/payment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PAYMENTS);
  const id = String((await params).id);
  return ok(await getPaymentDetail(id));
});

/**
 * A status flip from the row's menu, or a full edit from the dialog.
 *
 * The two share a route because they are the same act to whoever is doing it —
 * the body with nothing but a status in it is the quick one.
 */
export const PATCH = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PAYMENTS);
  const id = String((await params).id);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (Object.keys(body).length === 1 && "status" in body) {
    const { status } = setPaymentStatusSchema.parse(body);
    await setPaymentStatus(id, status);
    return ok({ message: "Payment updated." });
  }

  await updatePayment(id, updatePaymentSchema.parse(body));
  return ok({ message: "Payment saved." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PAYMENTS);
  const id = String((await params).id);
  await deletePayment(id);
  return ok({ message: "Payment deleted." });
});
