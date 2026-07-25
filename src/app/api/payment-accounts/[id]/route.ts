import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { paymentAccountSchema } from "@/lib/validations/payment";
import {
  updatePaymentAccount,
  deletePaymentAccount,
} from "@/server/services/payment-account-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PAYMENTS);
  const id = String((await params).id);
  const input = paymentAccountSchema.parse(await req.json().catch(() => ({})));
  await updatePaymentAccount(id, input);
  return ok({ message: "Account saved." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PAYMENTS);
  const id = String((await params).id);
  await deletePaymentAccount(id);
  return ok({ message: "Account deleted." });
});
