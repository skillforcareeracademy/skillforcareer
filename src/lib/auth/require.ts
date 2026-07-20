import { redirect } from "next/navigation";
import { getCurrentSession } from "./session";
import { getMe, type PublicUser } from "@/server/services/auth-service";
import { ROLE_HOME, type Permission, type Role } from "@/config/roles";

/**
 * Server-only guards for authenticated pages/layouts.
 * The Edge proxy (src/proxy.ts) is the first line of defence; these give a
 * second, data-backed check and hand the caller the current user.
 */
export async function requireUser(): Promise<PublicUser> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const user = await getMe(session.sub);
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
