import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/api-guard";
import { askSchema } from "@/lib/validations/chatbot";
import { askAmi, getChatGreeting } from "@/server/services/chatbot-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What the widget shows before anyone types — greeting plus starter chips. */
export const GET = withRoute(async () => {
  // Who is asking, when we know: the widget uses it to skip asking a signed-in
  // learner for details the panel already holds.
  const user = await getSessionUser();
  return ok(await getChatGreeting(user?.id ?? null));
});

/**
 * Ask Ami. Open to signed-out visitors on purpose — the whole point is
 * answering someone who hasn't decided to enrol yet.
 */
export const POST = withRoute(async (req) => {
  const input = askSchema.parse(await req.json().catch(() => ({})));
  const user = await getSessionUser();
  const reply = await askAmi({
    question: input.question,
    sessionId: input.sessionId,
    userId: user?.id ?? null,
  });
  return ok(reply);
});
