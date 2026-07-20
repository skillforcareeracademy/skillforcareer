import { NextResponse, type NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { ROLE_HOME, ROLES, type Role } from "@/config/roles";

/**
 * Route-protection proxy (Next.js 16 renamed `middleware` → `proxy`).
 * Edge-safe — jose only, no Node APIs.
 *
 * Guards the role-scoped dashboard sections. Unauthenticated users are sent to
 * /login (with a `next` param); authenticated users hitting a section they
 * don't own are redirected to their own dashboard home. The full auth flow that
 * issues these tokens lands in Step 3 — the enforcement structure is here now.
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
  const section = sectionFor(pathname);
  if (!section) return NextResponse.next();

  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  const toLogin = () => {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  };

  if (!token) return toLogin();

  try {
    const payload = await verifyToken(token, "access");
    const allowed = SECTION_ROLES[section];
    if (!allowed.includes(payload.role)) {
      const url = req.nextUrl.clone();
      url.pathname = ROLE_HOME[payload.role];
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  } catch {
    return toLogin();
  }
}

export const config = {
  matcher: ["/admin/:path*", "/instructor/:path*", "/student/:path*"],
};
