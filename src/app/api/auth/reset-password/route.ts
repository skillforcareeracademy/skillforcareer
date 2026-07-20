import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { resetPassword } from "@/server/services/auth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req) => {
  const body = await req.json().catch(() => ({}));
  const input = resetPasswordSchema.parse(body);
  const { email } = await resetPassword(input);

  return ok({
    email,
    message: "Password updated. You can now sign in.",
  });
});
