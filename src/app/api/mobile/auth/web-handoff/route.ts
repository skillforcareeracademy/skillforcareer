import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { safeNext } from "@/lib/auth/next-url";
import { env } from "@/lib/env";
import { createWebHandoff } from "@/server/services/auth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ next: z.string().max(300).optional() });

/**
 * POST /api/mobile/auth/web-handoff — a one-time link that opens the website
 * already signed in, for the panels the app doesn't have (admin, instructor,
 * leads). The app opens it in the in-app browser straight away; it works once,
 * for two minutes.
 */
export const POST = withRoute(async (req) => {
  const user = await requireApiUser();
  const { next } = bodySchema.parse(await req.json().catch(() => ({})));
  const { email, code } = await createWebHandoff(user.id);
  const url = new URL("/auth/handoff", env.NEXT_PUBLIC_APP_URL);
  url.searchParams.set("e", email);
  url.searchParams.set("c", code);
  const target = safeNext(next);
  if (target) url.searchParams.set("next", target);
  return ok({ url: url.toString() });
});
