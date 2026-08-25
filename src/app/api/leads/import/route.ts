import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { importLeadsSchema } from "@/lib/validations/lead";
import { importLeads } from "@/server/services/lead-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bulk-load leads from a CSV. Rows that can't be read come back in `errors`
 * rather than aborting the run, so a mostly-good sheet still lands.
 */
export const POST = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_LEADS);
  const input = importLeadsSchema.parse(await req.json().catch(() => ({})));
  const result = await importLeads(input);
  return created({
    ...result,
    message: `${result.imported} lead${result.imported === 1 ? "" : "s"} imported.`,
  });
});
