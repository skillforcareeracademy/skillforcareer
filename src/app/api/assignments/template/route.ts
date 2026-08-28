import { withRoute } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { csvResponse, toCsv } from "@/lib/csv";
import { assignmentImportTemplate } from "@/server/services/assignment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A one-row sample sheet so the columns the importer expects are visible. */
export const GET = withRoute(async () => {
  await requireApiPermission(PERMISSIONS.GRADE_ASSIGNMENT);
  const { headers, data } = assignmentImportTemplate();
  return csvResponse("assignments-import-template.csv", toCsv(headers, data));
});
