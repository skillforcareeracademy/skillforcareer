import { withRoute } from "@/lib/api/handler";
import { created } from "@/lib/api/response";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { importAssignmentsSchema } from "@/lib/validations/assignment";
import { importAssignments } from "@/server/services/assignment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bulk-create assignments from a sheet. Rows that can't be read come back in
 * `errors` rather than aborting the run, so a mostly-good sheet still lands.
 */
export const POST = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.GRADE_ASSIGNMENT);
  const input = importAssignmentsSchema.parse(await req.json().catch(() => ({})));
  const result = await importAssignments(input, user.id);
  return created({
    ...result,
    message: `${result.imported} assignment${result.imported === 1 ? "" : "s"} created.`,
  });
});
