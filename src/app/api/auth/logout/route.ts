import { cookies } from "next/headers";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { clearAuthCookies, REFRESH_TOKEN_COOKIE } from "@/lib/auth/session";
import { logout } from "@/server/services/auth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async () => {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_TOKEN_COOKIE)?.value;

  await logout(refreshToken);
  await clearAuthCookies();

  return ok({ success: true });
});
