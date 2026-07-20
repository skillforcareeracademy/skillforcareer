import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { couponSchema } from "@/lib/validations/coupon";
import { createCoupon } from "@/server/services/coupon-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PAYMENTS);
  const input = couponSchema.parse(await req.json().catch(() => ({})));
  const id = await createCoupon(input);
  return created({ id, message: "Coupon created." });
});
