import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { setAuthCookies } from "@/lib/auth/session";
import {
  readImpersonator,
  clearImpersonationCookie,
} from "@/lib/auth/impersonation";
import { ROLE_HOME, type Role } from "@/config/roles";
import { issueSessionFor } from "@/server/services/auth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * End the current impersonation and restore the admin's own session. No
 * permission gate — during impersonation the caller *is* the impersonated
 * (non-admin) user. Trust is anchored solely in the signed impersonation
 * cookie, which only the server can mint, so this can't be used to escalate.
 */
export const POST = withRoute(async () => {
  const adminId = await readImpersonator();
  if (!adminId) throw AppError.badRequest("You're not impersonating anyone.");

  const { user, tokens } = await issueSessionFor(adminId);
  await setAuthCookies(tokens);
  await clearImpersonationCookie();

  return ok({
    message: "Returned to your account.",
    redirect: ROLE_HOME[user.role as Role] ?? "/admin",
  });
});
