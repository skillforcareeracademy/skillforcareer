import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { bulkFeeTermsSchema } from "@/lib/validations/payment";
import { applyFeeTermsInBulk } from "@/server/services/fee-plan-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Put one set of fee terms on every unsettled plan in a scope. */
export const POST = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PAYMENTS);
  const input = bulkFeeTermsSchema.parse(await req.json().catch(() => ({})));
  const { count } = await applyFeeTermsInBulk(input);
  return ok({
    count,
    message:
      count === 0
        ? "No unsettled plan matched that."
        : `Terms applied to ${count} plan${count === 1 ? "" : "s"}.`,
  });
});
