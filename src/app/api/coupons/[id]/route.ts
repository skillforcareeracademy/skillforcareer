import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { couponSchema } from "@/lib/validations/coupon";
import { updateCoupon, deleteCoupon } from "@/server/services/coupon-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PAYMENTS);
  const id = String((await params).id);
  const input = couponSchema.parse(await req.json().catch(() => ({})));
  await updateCoupon(id, input);
  return ok({ message: "Coupon saved." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PAYMENTS);
  const id = String((await params).id);
  await deleteCoupon(id);
  return ok({ message: "Coupon deleted." });
});
