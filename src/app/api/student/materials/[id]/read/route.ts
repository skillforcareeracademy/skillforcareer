import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { materialReadSchema } from "@/lib/validations/study-material";
import { recordMaterialRead } from "@/server/services/material-learner-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A heartbeat from the reader. Deliberately quiet — it is sent in the
 * background, including on the way out of the page, and a failure is nothing
 * the reader can act on.
 */
export const POST = withRoute(async (req, { params }) => {
  const user = await requireApiUser();
  const id = String((await params).id);
  const body = materialReadSchema.parse(await req.json().catch(() => ({})));
  await recordMaterialRead(user.id, id, body.seconds ?? 0, body.opened ?? false);
  return ok({ ok: true });
});
