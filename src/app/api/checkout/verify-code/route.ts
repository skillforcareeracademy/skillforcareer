import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { setAuthCookies } from "@/lib/auth/session";
import { checkoutCodeSchema } from "@/lib/validations/checkout";
import { completeCheckoutOtp } from "@/server/services/auth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Step one-and-a-half: the code that proves an existing, password-less account. */
export const POST = withRoute(async (req) => {
  const input = checkoutCodeSchema.parse(await req.json().catch(() => ({})));
  const { user, tokens } = await completeCheckoutOtp(input);
  await setAuthCookies(tokens);
  return ok({ user });
});
