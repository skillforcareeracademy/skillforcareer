import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { settleWithdrawalSchema, walletAdjustSchema } from "@/lib/validations/wallet";
import { adjustWalletByAdmin, settleWithdrawal } from "@/server/services/wallet-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Settle a withdrawal request. `id` is the request's id.
 */
export const PATCH = withRoute(async (req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_PAYMENTS);
  const id = String((await params).id);
  const input = settleWithdrawalSchema.parse(await req.json().catch(() => ({})));
  await settleWithdrawal(id, user.id, {
    status: input.status,
    adminNote: input.adminNote || undefined,
  });
  return ok({ message: input.status === "PAID" ? "Marked as paid." : "Request declined." });
});

/**
 * Adjust a learner's balance — add, take off, or set it to a figure. `id` is
 * the learner's user id.
 */
export const POST = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PAYMENTS);
  const userId = String((await params).id);
  const input = walletAdjustSchema.parse(await req.json().catch(() => ({})));
  const balance = await adjustWalletByAdmin(userId, {
    mode: input.mode,
    amount: input.amount,
    reason: input.reason || undefined,
  });
  return ok({ balance, message: "Balance updated." });
});
