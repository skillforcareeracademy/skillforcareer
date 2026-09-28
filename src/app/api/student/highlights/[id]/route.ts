import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { materialHighlightSchema } from "@/lib/validations/study-material";
import {
  deleteHighlight,
  updateHighlight,
} from "@/server/services/material-learner-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = materialHighlightSchema.partial();

export const PATCH = withRoute(async (req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  const input = patchSchema.parse(await req.json().catch(() => ({})));
  await updateHighlight(user.id, id, input);
  return ok({ message: "Saved." });
});

export const DELETE = withRoute(async (_req, { params }) => {
  const user = await requireApiUser();
  await deleteHighlight(user.id, String((await params).id));
  return ok({ message: "Highlight removed." });
});
