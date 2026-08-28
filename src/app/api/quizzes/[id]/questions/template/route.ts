import { withRoute } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { csvResponse } from "@/lib/csv";
import { questionCsvTemplate } from "@/lib/question-csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A sample sheet showing the columns the importer expects, with one worked
 * example of each question type. Open to instructors — they can import a paper,
 * so they need to know what one looks like.
 */
export const GET = withRoute(async () => {
  await requireApiPermission(PERMISSIONS.MANAGE_QUIZ);
  return csvResponse("question-import-template.csv", questionCsvTemplate());
});
