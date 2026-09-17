import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/require";
import { safeNext } from "@/lib/auth/next-url";
import { getSettings } from "@/server/services/settings-service";
import { prepareCodingPracticeLaunch } from "@/server/services/coding-practice-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The "Coding Practice" link in the panels. A browser navigation, not a fetch:
 * it answers with redirects rather than the JSON envelope.
 *
 *   signed out     → /login, coming back here afterwards
 *   can't open it  → /coding-practice/unavailable, which says why
 *   otherwise      → the product's /sso/lms with a one-minute token
 *
 * `?next=` is a path inside the product (e.g. a particular test) and is passed
 * along untouched; the product checks it again before following it.
 */
export async function GET(req: NextRequest) {
  // Coming back from the sign-in form, the router first asks for an RSC payload.
  // Redirecting that fetch to another origin fails CORS (and mints a token for
  // nothing), so answer with an empty non-RSC response: the router then does a
  // full browser navigation here, which takes the normal path below.
  if (req.headers.get("rsc") === "1") {
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }

  const user = await getCurrentUser();
  if (!user) {
    const login = req.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("next", `${req.nextUrl.pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  const { settings } = await getSettings();
  const result = await prepareCodingPracticeLaunch(
    user,
    settings,
    safeNext(req.nextUrl.searchParams.get("next")),
  );

  if ("unavailable" in result) {
    const page = req.nextUrl.clone();
    page.pathname = "/coding-practice/unavailable";
    page.search = "";
    page.searchParams.set("reason", result.unavailable);
    return NextResponse.redirect(page);
  }

  const res = NextResponse.redirect(result.url, 302);
  // The Location carries a live token — never let anything cache it.
  res.headers.set("Cache-Control", "no-store");
  return res;
}
