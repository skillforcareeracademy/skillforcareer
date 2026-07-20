import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/api-guard";
import { registerWebinarSchema } from "@/lib/validations/webinar";
import { registerForWebinar } from "@/server/services/webinar-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: register for a webinar. Captures userId if signed in. */
export const POST = withRoute(async (req, { params }) => {
  const user = await getSessionUser();
  const id = String((await params).id);
  const input = registerWebinarSchema.parse(await req.json().catch(() => ({})));
  const { joinUrl } = await registerForWebinar(id, input, user?.id);
  return created({ joinUrl, message: "You're registered! We'll email you the details." });
});
