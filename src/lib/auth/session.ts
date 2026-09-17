import { cookies, headers } from "next/headers";
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

/**
 * The verified access-token payload, or null if unauthenticated.
 *
 * The browser sends the token in an httpOnly cookie. The Android and iOS apps
 * have no cookie jar to share with the website, so they send the same token as
 * `Authorization: Bearer …` instead; both arrive here, so every existing guard
 * works for the apps without being changed.
 */
export async function getCurrentSession(): Promise<AuthTokenPayload | null> {
  const store = await cookies();
  const token = store.get(ACCESS_TOKEN_COOKIE)?.value ?? (await bearerToken());
  if (!token) return null;
  try {
    return await verifyToken(token, "access");
  } catch {
    return null;
  }
}

async function bearerToken(): Promise<string | null> {
  const authorization = (await headers()).get("authorization");
  if (!authorization) return null;
  const [scheme, value] = authorization.split(" ");
  return scheme?.toLowerCase() === "bearer" && value ? value.trim() : null;
}
