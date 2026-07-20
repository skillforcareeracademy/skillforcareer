import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "./session";
import { getMe, type PublicUser } from "@/server/services/auth-service";
import { ROLE_HOME, type Permission, type Role } from "@/config/roles";

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
  return getMe(session.sub);
});

export async function requireUser(): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(allowed: Role[]): Promise<PublicUser> {
  const user = await requireUser();
  if (!allowed.includes(user.role)) {
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
