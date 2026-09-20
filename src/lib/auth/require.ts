import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SECTION_HEADER } from "./section";
import { getCurrentSession } from "./session";
import { getMe, type PublicUser } from "@/server/services/auth-service";
import { ROLE_HOME, ROLES, type Permission, type Role } from "@/config/roles";


const SECTION_ROLE: Record<string, Role> = {
  "/instructor": ROLES.INSTRUCTOR,
  "/student": ROLES.STUDENT,
};

/**
 * Someone can hold more than one role — an instructor who is also studying, a
 * student who also teaches. Inside the panel they reached through an extra
 * role, act as that role: an instructor browsing /student sees the learner
 * navigation and their own learning, not an instructor's view of it. Admins
 * keep their own role everywhere; they may enter every panel anyway.
 */
function asSectionRole(user: PublicUser, section: string | null): PublicUser {
  const wanted = section ? SECTION_ROLE[section] : undefined;
  if (!wanted || user.role === wanted) return user;
  if (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.ADMIN) return user;
  return user.roles.includes(wanted) ? { ...user, role: wanted } : user;
}

/**
 * Server-only guards for authenticated pages/layouts.
 * The proxy (src/proxy.ts) is the first line of defence; these give a
 * second, data-backed check and hand the caller the current user.
 *
 * Every guarded page resolves the user at least twice — once in the dashboard
 * layout and again in the page's own guard. The `cache()` wrapper collapses
 * those into a single lookup per request; without it each one is its own
 * round-trip to a database that is not in the same region as the app.
 */
export const getCurrentUser = cache(async (): Promise<PublicUser | null> => {
  const session = await getCurrentSession();
  if (!session) return null;
  const user = await getMe(session.sub);
  if (!user) return null;
  return asSectionRole(user, (await headers()).get(SECTION_HEADER));
});

export async function requireUser(): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(allowed: Role[]): Promise<PublicUser> {
  const user = await requireUser();
  if (!allowed.includes(user.role) && !user.roles.some((r) => allowed.includes(r))) {
    redirect(ROLE_HOME[user.role] ?? "/login");
  }
  return user;
}

/** Require a specific permission; bounce to the role's home if missing. */
export async function requirePermission(
  permission: Permission,
): Promise<PublicUser> {
  const user = await requireUser();
  if (!user.permissions.includes(permission)) {
    redirect(ROLE_HOME[user.role] ?? "/login");
  }
  return user;
}
