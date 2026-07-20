import { cookies } from "next/headers";
import { verifyToken, type AuthTokenPayload } from "./jwt";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "./cookies";

/**
 * Cookie-backed session for Server Components and Route Handlers.
 *
 * Tokens are stored in httpOnly cookies (not readable by JS, mitigating XSS
 * token theft). The full login/refresh flow that *sets* these lands in Step 3;
 * the reader below is already usable by any server code that needs the current
 * user.
 */
export { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE };

const ACCESS_MAX_AGE = 60 * 15; // 15 minutes
const REFRESH_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const isProd = process.env.NODE_ENV === "production";

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function setAuthCookies(tokens: {
  accessToken: string;
  refreshToken: string;
}): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, cookieOptions(ACCESS_MAX_AGE));
  store.set(
    REFRESH_TOKEN_COOKIE,
    tokens.refreshToken,
    cookieOptions(REFRESH_MAX_AGE),
  );
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
