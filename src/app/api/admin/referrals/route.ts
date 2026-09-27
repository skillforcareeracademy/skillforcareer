import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { referralSettingsSchema } from "@/lib/validations/referral";
import { updateSettings } from "@/server/services/settings-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The programme's own settings, saved from the Referral System page. They live
 * in the same settings row as everything else — this is a narrower door onto
 * four of its fields, so the page doesn't need the whole settings form.
 */
export const PATCH = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_SETTINGS);
  const input = referralSettingsSchema.parse(await req.json().catch(() => ({})));
  await updateSettings(input, user.id);
  return ok({ message: "Referral settings saved." });
});
