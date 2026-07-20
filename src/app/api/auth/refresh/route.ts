import { cookies } from "next/headers";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { setAuthCookies, REFRESH_TOKEN_COOKIE } from "@/lib/auth/session";
import { refresh } from "@/server/services/auth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Rotate the access/refresh pair using the refresh cookie. */
export const POST = withRoute(async () => {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) throw AppError.unauthorized("Not authenticated.");

  const { user, tokens } = await refresh(refreshToken);
  await setAuthCookies(tokens);

  return ok({ user });
});
