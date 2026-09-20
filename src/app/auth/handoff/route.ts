import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { destinationFor } from "@/lib/auth/next-url";
import { accessCookieOptions, refreshCookieOptions } from "@/lib/auth/session";
import { redeemWebHandoff } from "@/server/services/auth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /auth/handoff?e=&c=&next= — land here from the phone app's "Open admin
 * panel": spend the one-time code, set the session cookies and go straight to
 * the panel. A spent or stale link falls back to the sign-in page.
 */
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("e") ?? "";
  const code = req.nextUrl.searchParams.get("c") ?? "";
  const next = req.nextUrl.searchParams.get("next");
  try {
    const { user, tokens } = await redeemWebHandoff(email, code);
    const res = NextResponse.redirect(new URL(destinationFor(user.role, next), req.url));
    res.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, accessCookieOptions());
    res.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, refreshCookieOptions());
    return res;
  } catch {
    const login = new URL("/login", req.url);
    if (next) login.searchParams.set("next", next);
    return NextResponse.redirect(login);
  }
}
