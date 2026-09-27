import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { withdrawalSchema } from "@/lib/validations/wallet";
import { requestWithdrawal } from "@/server/services/wallet-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The learner asks for money out of their wallet. */
export const POST = withRoute(async (req) => {
  const user = await requireApiUser();
  const input = withdrawalSchema.parse(await req.json().catch(() => ({})));
  const row = await requestWithdrawal(user.id, {
    amount: input.amount,
    payoutNote: input.payoutNote || undefined,
  });
  return created({ ...row, message: "Request sent — the academy will pay it out." });
});
