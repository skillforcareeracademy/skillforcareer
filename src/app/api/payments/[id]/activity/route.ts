import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { listPaymentActivity } from "@/server/services/payment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The change trail for one payment — "jo jo humne change kiya hai save kiya hai". */
export const GET = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PAYMENTS);
  const id = String((await params).id);
  return ok(await listPaymentActivity(id));
});
