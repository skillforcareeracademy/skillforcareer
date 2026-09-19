import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { emailSchema, otpSchema } from "@/lib/validations/auth";
import { loginWithCode } from "@/server/services/auth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ email: emailSchema, code: otpSchema });

/**
 * POST /api/mobile/auth/verify-code — finish signing in with an emailed code.
 *
 * The code comes from `/api/auth/request-code`; like `/api/mobile/auth/login`,
 * the tokens go back in the body for the app to keep in the device keychain.
 */
export const POST = withRoute(async (req) => {
  const input = bodySchema.parse(await req.json().catch(() => ({})));
  const { user, tokens } = await loginWithCode(input);
  return ok({ user, ...tokens });
});
