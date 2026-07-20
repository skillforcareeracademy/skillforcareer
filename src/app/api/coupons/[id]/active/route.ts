import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { setCouponActive } from "@/server/services/coupon-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ isActive: z.boolean() });

export const POST = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PAYMENTS);
  const id = String((await params).id);
  const { isActive } = bodySchema.parse(await req.json().catch(() => ({})));
  await setCouponActive(id, isActive);
  return ok({ message: isActive ? "Coupon activated." : "Coupon deactivated." });
});
