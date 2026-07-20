import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { setAuthCookies } from "@/lib/auth/session";
import { setImpersonationCookie } from "@/lib/auth/impersonation";
import { PERMISSIONS, ROLES, ROLE_HOME, type Role } from "@/config/roles";
import { getUserForImpersonation } from "@/server/services/user-service";
import { issueSessionFor } from "@/server/services/auth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Secret login" — start impersonating another user. The admin's own session
 * is swapped for the target's; a signed impersonation cookie records who to
 * restore later. Guarded so an admin can never impersonate another staff
 * account (no lateral or upward privilege escalation).
 */
export const POST = withRoute(async (_req, { params }) => {
  const actor = await requireApiPermission(PERMISSIONS.MANAGE_USERS);
  const id = String((await params).id);

  if (id === actor.id) {
    throw AppError.badRequest("You're already signed in as yourself.");
  }

  const target = await getUserForImpersonation(id);
  if (!target) throw AppError.notFound("User not found.");
  if (target.role === ROLES.SUPER_ADMIN || target.role === ROLES.ADMIN) {
    throw AppError.forbidden("You can't impersonate an admin account.");
  }

  const { tokens } = await issueSessionFor(target.id);
  await setImpersonationCookie(actor.id);
  await setAuthCookies(tokens);

  return ok({
    message: `You are now signed in as ${target.name}.`,
    redirect: ROLE_HOME[target.role as Role] ?? "/student",
  });
});
