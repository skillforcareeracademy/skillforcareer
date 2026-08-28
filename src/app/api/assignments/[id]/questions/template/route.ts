import { withRoute } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { csvResponse } from "@/lib/csv";
import { questionCsvTemplate } from "@/lib/question-csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A sample sheet showing the columns the importer expects. */
export const GET = withRoute(async () => {
  await requireApiPermission(PERMISSIONS.GRADE_ASSIGNMENT);
  return csvResponse("question-import-template.csv", questionCsvTemplate());
});
