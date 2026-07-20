import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { validateCouponSchema } from "@/lib/validations/coupon";
import { validateCoupon } from "@/server/services/coupon-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: validate a coupon code for an amount/course (checkout preview). */
export const POST = withRoute(async (req) => {
  const { code, amount, courseId } = validateCouponSchema.parse(await req.json().catch(() => ({})));
  const result = await validateCoupon(code, amount, courseId || undefined);
  return ok(result);
});
