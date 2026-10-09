import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import {
  createFeeSettlementOrder,
  settleOptions,
} from "@/server/services/payment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What this learner could pay right now against one of their plans. */
export const GET = withRoute(async (req) => {
  const user = await requireApiUser();
  const paymentId = new URL(req.url).searchParams.get("paymentId") ?? "";
  return ok(await settleOptions(user.id, paymentId));
});

const bodySchema = z.object({
  paymentId: z.string().min(1),
  choice: z.enum(["FULL", "NEXT", "CUSTOM"]).default("FULL"),
  amount: z.coerce.number().min(0).max(10_000_000).optional(),
});

/** Start a checkout for fees owed — in full, the next instalment, or a part. */
export const POST = withRoute(async (req) => {
  const user = await requireApiUser();
  const { paymentId, choice, amount } = bodySchema.parse(
    await req.json().catch(() => ({})),
  );
  return ok(await createFeeSettlementOrder(user, paymentId, choice, amount));
});
