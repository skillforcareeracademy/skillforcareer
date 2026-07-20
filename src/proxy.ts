import { NextResponse, type NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { accessCookieOptions, refreshCookieOptions } from "@/lib/auth/session";
import { renewFromRefreshToken } from "@/lib/auth/renew";
import { ROLE_HOME, ROLES, type Role } from "@/config/roles";

/**
 * Route-protection proxy (Next.js 16 renamed `middleware` → `proxy`, and it now
 * runs in the Node.js runtime by default — hence the DB-backed renewal below).
 *
 * Two jobs:
 *   1. Keep the session alive. Access tokens last minutes; the refresh token is
 *      what actually represents the session. When the access token has lapsed
 *      this mints a new one from the refresh cookie and lets the request carry
 *      on, so a signed-in user is only ever signed *out* by logging out (or by
 *      a server-side revocation). Without this the user was bounced to /login
 *      15 minutes after signing in.
 *   2. Guard the role-scoped dashboard sections. Unauthenticated users are sent
 *      to /login (with a `next` param); authenticated users hitting a section
 *      they don't own are redirected to their own dashboard home.
 */
const SECTION_ROLES: Record<string, Role[]> = {
  "/admin": [ROLES.SUPER_ADMIN, ROLES.ADMIN],
  "/instructor": [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.INSTRUCTOR],
  "/student": [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STUDENT],
};

function sectionFor(pathname: string): string | null {
  return (
    Object.keys(SECTION_ROLES).find(
      (base) => pathname === base || pathname.startsWith(`${base}/`),
    ) ?? null
  );
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The auth endpoints issue and clear these cookies themselves — renewing
  // underneath them would fight the Set-Cookie headers they're writing.
  if (pathname.startsWith("/api/auth/")) return NextResponse.next();

  const section = sectionFor(pathname);

  const toLogin = () => {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    const res = NextResponse.redirect(url);
    // The refresh token is spent — drop both so we don't retry it every request.
    res.cookies.delete(ACCESS_TOKEN_COOKIE);
    res.cookies.delete(REFRESH_TOKEN_COOKIE);
    return res;
  };

  const accessToken = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (accessToken) {
    try {
      const payload = await verifyToken(accessToken, "access");
      return authorize(req, payload.role, section);
    } catch {
      // Expired or invalid — fall through to renewal rather than signing out.
    }
  }

  const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) {
    return section ? toLogin() : NextResponse.next();
  }

  const renewed = await renewFromRefreshToken(refreshToken);
  if (!renewed) {
    // Genuinely signed out: token revoked, lapsed, or unknown to the DB.
    return section ? toLogin() : NextResponse.next();
  }

  // Hand the fresh token to the app *within this same request*, so the Server
  // Component reading cookies() downstream sees it instead of the stale one and
  // doesn't `redirect("/login")` out from under us.
  req.cookies.set(ACCESS_TOKEN_COOKIE, renewed.accessToken);
  if (renewed.refreshToken) {
    req.cookies.set(REFRESH_TOKEN_COOKIE, renewed.refreshToken);
  }

  const res = authorize(req, renewed.claims.role, section, {
    headers: req.headers,
  });

  // ...and to the browser, for every request after this one.
  res.cookies.set(
    ACCESS_TOKEN_COOKIE,
    renewed.accessToken,
    accessCookieOptions(),
  );
  if (renewed.refreshToken) {
    res.cookies.set(
      REFRESH_TOKEN_COOKIE,
      renewed.refreshToken,
      refreshCookieOptions(),
    );
  }
  return res;
}

/** Continue the request, or bounce to the caller's own dashboard home. */
function authorize(
  req: NextRequest,
  role: Role,
  section: string | null,
  init?: { headers: Headers },
) {
  if (section && !SECTION_ROLES[section].includes(role)) {
    const url = req.nextUrl.clone();
    url.pathname = ROLE_HOME[role];
    url.search = "";
    return NextResponse.redirect(url);
  }
  return init ? NextResponse.next({ request: init }) : NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/instructor/:path*",
    "/student/:path*",
    // Renewal only (no role gate) — keeps client-side fetches from 401-ing once
    // the access token lapses while a tab sits open.
    "/api/:path*",
  ],
};
