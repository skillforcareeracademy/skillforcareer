import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { refresh } from "@/server/services/auth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ refreshToken: z.string().min(10) });

/**
 * POST /api/mobile/auth/refresh — swap a refresh token for a fresh pair.
 * The app calls this when a request comes back 401, so a signed-in learner is
 * only ever signed out by tapping Sign out.
 */
export const POST = withRoute(async (req) => {
  const { refreshToken } = bodySchema.parse(await req.json().catch(() => ({})));
  const { user, tokens } = await refresh(refreshToken);
  return ok({ user, ...tokens });
});
