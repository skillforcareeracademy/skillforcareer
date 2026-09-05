import { cookies } from "next/headers";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { clearAuthCookies, REFRESH_TOKEN_COOKIE } from "@/lib/auth/session";
import { getSessionUser } from "@/lib/auth/api-guard";
import { logout } from "@/server/services/auth-service";
import { ACTIVITY_ACTIONS, logActivity } from "@/server/services/activity-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req) => {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_TOKEN_COOKIE)?.value;

  // Read the session before it is torn down — afterwards there is no way to
  // say whose sign-out this was.
  const user = await getSessionUser();

  await logout(refreshToken);
  await clearAuthCookies();

  if (user) {
    void logActivity({
      userId: user.id,
      action: ACTIVITY_ACTIONS.LOGOUT,
      entityType: "User",
      entityId: user.id,
      request: req,
    });
  }

  return ok({ success: true });
});
