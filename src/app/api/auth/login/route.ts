import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { setAuthCookies } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validations/auth";
import { login } from "@/server/services/auth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req) => {
  const body = await req.json().catch(() => ({}));
  const input = loginSchema.parse(body);

  const { user, tokens } = await login(input);
  await setAuthCookies(tokens);

  return ok({ user });
});
