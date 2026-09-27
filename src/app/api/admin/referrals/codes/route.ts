import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { createReferralCodeSchema } from "@/lib/validations/referral";
import { setReferralCodeByAdmin } from "@/server/services/referral-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hand a learner a referral code from the panel, generated or chosen. */
export const POST = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_USERS);
  const input = createReferralCodeSchema.parse(await req.json().catch(() => ({})));
  const code = await setReferralCodeByAdmin(input.userId, input.code || null);
  return created({ code, message: `Code ${code} is ready.` });
});
