import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiLeadList } from "@/lib/auth/api-guard";
import { leadCardPrefsSchema } from "@/lib/validations/lead";
import { saveLeadCards } from "@/server/services/lead-preferences-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Save which stat cards this counsellor keeps above the lead list. */
export const PATCH = withRoute(async (req) => {
  const { user } = await requireApiLeadList();
  const input = leadCardPrefsSchema.parse(await req.json().catch(() => ({})));
  const cards = await saveLeadCards(user.id, input.cards);
  return ok({ cards, message: "Cards saved." });
});
