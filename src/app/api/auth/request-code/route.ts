import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { emailSchema } from "@/lib/validations/auth";
import { requestLoginCode } from "@/server/services/auth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isDev = process.env.NODE_ENV !== "production";
const bodySchema = z.object({ email: emailSchema });

/**
 * POST /api/auth/request-code — email a one-time sign-in code.
 *
 * Step one of signing in without a password. The answer is the same whether
 * or not the address has an account; the code itself only ever travels by
 * email (and, in development, back in the response so it works without SMTP).
 */
export const POST = withRoute(async (req) => {
  const { email } = bodySchema.parse(await req.json().catch(() => ({})));
  const { code } = await requestLoginCode(email);
  return ok({
    email,
    message: "If an account exists, a sign-in code has been sent.",
    ...(isDev && code ? { devOtp: code } : {}),
  });
});
