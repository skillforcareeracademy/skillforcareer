import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { loginSchema } from "@/lib/validations/auth";
import { login } from "@/server/services/auth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/auth/login — the Android and iOS sign-in.
 *
 * Same credentials and same checks as the website; the difference is where the
 * tokens go. The browser gets httpOnly cookies it cannot read; the apps get the
 * tokens in the body and keep them in the device keychain, then send the access
 * token as `Authorization: Bearer …` on every call.
 */
export const POST = withRoute(async (req) => {
  const input = loginSchema.parse(await req.json().catch(() => ({})));
  const { user, tokens } = await login(input);
  return ok({ user, ...tokens });
});
