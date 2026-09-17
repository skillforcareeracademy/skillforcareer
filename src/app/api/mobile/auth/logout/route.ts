import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { logout } from "@/server/services/auth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ refreshToken: z.string().optional() });

/** POST /api/mobile/auth/logout — revokes the device's refresh token. */
export const POST = withRoute(async (req) => {
  const { refreshToken } = bodySchema.parse(await req.json().catch(() => ({})));
  await logout(refreshToken);
  return ok({ signedOut: true });
});
