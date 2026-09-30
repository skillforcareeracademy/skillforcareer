import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiLeadAdmin } from "@/lib/auth/api-guard";
import { LEAD_STAGES } from "@/lib/validations/lead";
import { createStage } from "@/server/services/lead-pipeline-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(1, "Name the stage").max(60),
  /** Which built-in it behaves like — what keeps the reports honest. */
  systemStage: z.enum(LEAD_STAGES).default("FRESH_LEAD"),
  color: z.string().trim().max(20).optional(),
});

export const POST = withRoute(async (req) => {
  await requireApiLeadAdmin();
  const input = schema.parse(await req.json().catch(() => ({})));
  const id = await createStage(input);
  return created({ id, message: "Stage added." });
});
