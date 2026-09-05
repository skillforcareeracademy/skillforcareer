import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { setAuthCookies } from "@/lib/auth/session";
import { checkoutIdentifySchema } from "@/lib/validations/checkout";
import { identifyForCheckout } from "@/server/services/auth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Step one of buying without an account: turn a name/email/phone into a signed-in
 * session, creating the account if this is a new face.
 *
 * The three answers the client gets back drive the form's next state — signed in
 * and ready to pay, ask for a password, or ask for the emailed code.
 */
export const POST = withRoute(async (req) => {
  const input = checkoutIdentifySchema.parse(await req.json().catch(() => ({})));
  const result = await identifyForCheckout(input);

  if (result.status === "SIGNED_IN") {
    await setAuthCookies(result.tokens);
    return ok({ status: result.status, user: result.user, created: result.created });
  }

  if (result.status === "CODE_SENT") {
    return ok({
      status: result.status,
      name: result.name,
      email: result.email,
      // Dev convenience, exactly as the register route does it.
      ...(isDev ? { devOtp: result.code } : {}),
    });
  }

  return ok({ status: result.status, name: result.name, email: result.email });
});
