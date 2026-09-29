import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/api-guard";
import { requestCounsellor } from "@/server/services/chatbot-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
  sessionId: z.string().trim().max(64).optional(),
});

/**
 * POST /api/chat/counsellor — "put me through to a person".
 *
 * Open to signed-out visitors, who are asked for a name and a number; a
 * signed-in learner's account answers both, so Ami never asks them again.
 */
export const POST = withRoute(async (req) => {
  const input = schema.parse(await req.json().catch(() => ({})));
  const user = await getSessionUser();
  const result = await requestCounsellor({ ...input, userId: user?.id ?? null });
  return ok({
    ...result,
    message: `Thanks ${result.name.split(" ")[0]} — a counsellor will call you on ${result.phone}.`,
  });
});
