import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { leadReminderSchema } from "@/lib/validations/lead";
import { remindLead } from "@/server/services/lead-reminder-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Email and/or SMS a lead about their upcoming visit. */
export const POST = withRoute(async (req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_LEADS);
  const id = String((await params).id);
  const input = leadReminderSchema.parse(await req.json().catch(() => ({})));
  const result = await remindLead(id, input, user.id);

  const sent = [result.email && "Email", result.sms && "SMS"]
    .filter(Boolean)
    .join(" + ");
  return ok({ ...result, message: `${sent} reminder sent.` });
});
