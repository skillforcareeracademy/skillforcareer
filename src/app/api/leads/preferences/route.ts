import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { leadCardPrefsSchema } from "@/lib/validations/lead";
import { saveLeadCards } from "@/server/services/lead-preferences-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Save which stat cards this counsellor keeps above the lead list. */
export const PATCH = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_LEADS);
  const input = leadCardPrefsSchema.parse(await req.json().catch(() => ({})));
  const cards = await saveLeadCards(user.id, input.cards);
  return ok({ cards, message: "Cards saved." });
});
