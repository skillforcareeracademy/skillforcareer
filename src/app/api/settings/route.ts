import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { updateSettingsSchema } from "@/lib/validations/settings";
import { getSettings, updateSettings } from "@/server/services/settings-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async () => {
  await requireApiPermission(PERMISSIONS.MANAGE_SETTINGS);
  return ok(await getSettings());
});

export const PATCH = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_SETTINGS);
  const input = updateSettingsSchema.parse(await req.json().catch(() => ({})));
  return ok(await updateSettings(input, user.id));
});
