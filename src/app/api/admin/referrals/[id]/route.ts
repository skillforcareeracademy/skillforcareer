import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { referralActionSchema } from "@/lib/validations/referral";
import { cancelReferral, payReferralByHand } from "@/server/services/referral-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pay a referral by hand, or close it without paying. */
export const PATCH = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PAYMENTS);
  const id = String((await params).id);
  const { action } = referralActionSchema.parse(await req.json().catch(() => ({})));
  if (action === "PAY") {
    await payReferralByHand(id);
    return ok({ message: "Paid into the referrer's wallet." });
  }
  await cancelReferral(id);
  return ok({ message: "Referral closed." });
});
