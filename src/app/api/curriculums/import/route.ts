import { z } from "zod";
import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { importCurriculums } from "@/server/services/curriculum-plan-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  csv: z.string().min(1, "Paste or upload a CSV first").max(2_000_000),
});

/** Read a curriculum sheet back in — the same shape the export writes. */
export const POST = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_CURRICULUM);
  const { csv } = bodySchema.parse(await req.json().catch(() => ({})));
  const result = await importCurriculums(csv, user.id);
  const parts: string[] = [];
  if (result.created) parts.push(`${result.created} added`);
  if (result.updated) parts.push(`${result.updated} updated`);
  return created({
    ...result,
    message: parts.length ? `${parts.join(", ")}.` : "Nothing to import.",
  });
});
