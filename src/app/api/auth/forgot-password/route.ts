import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { forgotPassword } from "@/server/services/auth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isDev = process.env.NODE_ENV !== "production";

export const POST = withRoute(async (req) => {
  const body = await req.json().catch(() => ({}));
  const input = forgotPasswordSchema.parse(body);
  const { email, code } = await forgotPassword(input);

  return ok({
    email,
    message: "If an account exists, a reset code has been sent.",
    ...(isDev && code ? { devOtp: code } : {}),
  });
});
