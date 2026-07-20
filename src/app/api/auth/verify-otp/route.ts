import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { setAuthCookies } from "@/lib/auth/session";
import { verifyOtpSchema } from "@/lib/validations/auth";
import { verifyEmailOtp } from "@/server/services/auth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Verify the email OTP and, on success, start an authenticated session. */
export const POST = withRoute(async (req) => {
  const body = await req.json().catch(() => ({}));
  const input = verifyOtpSchema.parse(body);

  const { user, tokens } = await verifyEmailOtp({
    email: input.email,
    code: input.code,
  });
  await setAuthCookies(tokens);

  return ok({ user });
});
