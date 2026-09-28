import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { materialHighlightSchema } from "@/lib/validations/study-material";
import { addHighlight } from "@/server/services/material-learner-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mark a passage, with a note if they wrote one. Theirs alone. */
export const POST = withRoute(async (req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  const input = materialHighlightSchema.parse(await req.json().catch(() => ({})));
  const highlightId = await addHighlight(user.id, id, input);
  return created({ id: highlightId, message: "Highlighted." });
});
