import { withRoute } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { paymentAccountSchema } from "@/lib/validations/payment";
import {
  listPaymentAccounts,
  createPaymentAccount,
} from "@/server/services/payment-account-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async () => {
  await requireApiPermission(PERMISSIONS.MANAGE_PAYMENTS);
  return ok({ accounts: await listPaymentAccounts() });
});

export const POST = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PAYMENTS);
  const input = paymentAccountSchema.parse(await req.json().catch(() => ({})));
  const id = await createPaymentAccount(input);
  return created({ id, message: "Account added." });
});
