import { cookies } from "next/headers";
import { verifyToken, type AuthTokenPayload } from "./jwt";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "./cookies";
import { accessTtlSeconds, refreshTtlSeconds } from "./duration";

/**
 * Cookie-backed session for Server Components and Route Handlers.
 *
 * Tokens are stored in httpOnly cookies (not readable by JS, mitigating XSS
 * token theft). The full login/refresh flow that *sets* these lands in Step 3;
 * the reader below is already usable by any server code that needs the current
 * user.
 */
export { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE };

const isProd = process.env.NODE_ENV === "production";

/** Shared with the proxy's silent renewal so both write identical cookies. */
export function authCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export const accessCookieOptions = () => authCookieOptions(accessTtlSeconds());
export const refreshCookieOptions = () => authCookieOptions(refreshTtlSeconds());

export async function setAuthCookies(tokens: {
  accessToken: string;
  refreshToken: string;
}): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, accessCookieOptions());
  store.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, refreshCookieOptions());
}

export async function clearAuthCookies(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_TOKEN_COOKIE);
  store.delete(REFRESH_TOKEN_COOKIE);
}

/** Returns the verified access-token payload, or null if unauthenticated. */
export async function getCurrentSession(): Promise<AuthTokenPayload | null> {
  const store = await cookies();
  const token = store.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;
  try {
    return await verifyToken(token, "access");
  } catch {
    return null;
  }
}
