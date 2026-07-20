import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { notificationPrefsSchema } from "@/lib/validations/preferences";
import {
  getNotificationPrefs,
  updateNotificationPrefs,
} from "@/server/services/preferences-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async () => {
  const user = await requireApiUser();
  const notifications = await getNotificationPrefs(user.id);
  return ok({ notifications });
});

export const PATCH = withRoute(async (req) => {
  const user = await requireApiUser();
  const prefs = notificationPrefsSchema.parse(await req.json().catch(() => ({})));
  await updateNotificationPrefs(user.id, prefs);
  return ok({ message: "Preferences saved." });
});
