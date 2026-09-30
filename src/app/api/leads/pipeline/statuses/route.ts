import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiLeadAdmin } from "@/lib/auth/api-guard";
import { createStatus } from "@/server/services/lead-pipeline-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(1, "Name the status").max(60),
  /** Leave it out for a status every stage can use. */
  stageOptionId: z.string().trim().optional(),
});

export const POST = withRoute(async (req) => {
  await requireApiLeadAdmin();
  const input = schema.parse(await req.json().catch(() => ({})));
  const id = await createStatus(input);
  return created({ id, message: "Status added." });
});
