import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { getCurrentSession } from "@/lib/auth/session";
import { getMe } from "@/server/services/auth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/auth/me — the current authenticated user, or 401. */
export const GET = withRoute(async () => {
  const session = await getCurrentSession();
  if (!session) throw AppError.unauthorized("Not authenticated.");

  const user = await getMe(session.sub);
  if (!user) throw AppError.unauthorized("Not authenticated.");

  return ok({ user });
});
