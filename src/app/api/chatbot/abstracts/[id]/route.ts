import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import {
  abstractToLead,
  abstractTranscript,
  dismissAbstract,
} from "@/server/services/chatbot-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["lead", "dismiss"]) });

/** The conversation behind one abstract, for reading beside it. */
export const GET = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  const sessionId = String((await params).id);
  return ok({ messages: await abstractTranscript(sessionId) });
});

/** Put it on the lead sheet, or take it off the list. */
export const POST = withRoute(async (req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  const id = String((await params).id);
  const { action } = schema.parse(await req.json().catch(() => ({})));

  if (action === "dismiss") {
    await dismissAbstract(id);
    return ok({ message: "Cleared." });
  }
  const leadId = await abstractToLead(id);
  return ok({ leadId, message: "Added to Leads." });
});
