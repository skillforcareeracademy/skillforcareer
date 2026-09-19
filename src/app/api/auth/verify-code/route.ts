import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { setAuthCookies } from "@/lib/auth/session";
import { emailSchema, otpSchema } from "@/lib/validations/auth";
import { loginWithCode } from "@/server/services/auth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ email: emailSchema, code: otpSchema });

/**
 * POST /api/auth/verify-code — the website's "sign in with an emailed code".
 * The code comes from `/api/auth/request-code`; the session is set as cookies,
 * exactly as a password sign-in does.
 */
export const POST = withRoute(async (req) => {
  const input = bodySchema.parse(await req.json().catch(() => ({})));
  const { user, tokens } = await loginWithCode(input);
  await setAuthCookies(tokens);
  return ok({ user });
});
