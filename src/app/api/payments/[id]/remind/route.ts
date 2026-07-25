import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { remindPayment } from "@/server/services/payment-reminder-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-initiated payment reminder (in-app + email). */
export const POST = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PAYMENTS);
  const id = String((await params).id);
  await remindPayment(id);
  return ok({ message: "Reminder sent." });
});
