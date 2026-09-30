import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiLeadAdmin } from "@/lib/auth/api-guard";
import { LEAD_STAGES } from "@/lib/validations/lead";
import { deleteStage, updateStage } from "@/server/services/lead-pipeline-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: z.string().trim().max(20).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  systemStage: z.enum(LEAD_STAGES).optional(),
});

export const PATCH = withRoute(async (req, { params }) => {
  await requireApiLeadAdmin();
  const id = String((await params).id);
  await updateStage(id, schema.parse(await req.json().catch(() => ({}))));
  return ok({ message: "Saved." });
});

/** Leads in the stage move to the one named; nothing is left stranded. */
export const DELETE = withRoute(async (req, { params }) => {
  await requireApiLeadAdmin();
  const id = String((await params).id);
  const moveTo = new URL(req.url).searchParams.get("moveTo") ?? undefined;
  const moved = await deleteStage(id, moveTo);
  return ok({
    moved,
    message: moved > 0 ? `Stage removed. ${moved} lead${moved === 1 ? "" : "s"} moved.` : "Stage removed.",
  });
});
