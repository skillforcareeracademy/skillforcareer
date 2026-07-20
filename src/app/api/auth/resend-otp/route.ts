import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { resendOtpSchema } from "@/lib/validations/auth";
import { resendOtp } from "@/server/services/auth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isDev = process.env.NODE_ENV !== "production";

export const POST = withRoute(async (req) => {
  const body = await req.json().catch(() => ({}));
  const input = resendOtpSchema.parse(body);
  const { email, code } = await resendOtp(input);

  return ok({
    email,
    message: "If an account exists, a new code has been sent.",
    ...(isDev && code ? { devOtp: code } : {}),
  });
});
