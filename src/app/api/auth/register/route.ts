import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { registerSchema } from "@/lib/validations/auth";
import { register } from "@/server/services/auth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isDev = process.env.NODE_ENV !== "production";

export const POST = withRoute(async (req) => {
  const body = await req.json().catch(() => ({}));
  const input = registerSchema.parse(body);
  const { email, code } = await register(input);

  return created(
    {
      email,
      message: "We've sent a 6-digit verification code to your email.",
      // dev convenience so the flow can be completed without an inbox.
      ...(isDev ? { devOtp: code } : {}),
    },
  );
});
