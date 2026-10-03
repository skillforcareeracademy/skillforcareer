import { withRoute } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { csvResponse } from "@/lib/csv";
import { questionCsvTemplate, TEMPLATE_KINDS, type TemplateKind } from "@/lib/question-csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A sample sheet showing the columns the importer expects, with one worked
 * example of each question type. Open to instructors — they can import a paper,
 * so they need to know what one looks like.
 */
export const GET = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_QUIZ);
  // `?type=` narrows the sheet to one kind of question.
  const asked = new URL(req.url).searchParams.get("type") ?? "ALL";
  const kind = (TEMPLATE_KINDS as readonly string[]).includes(asked)
    ? (asked as TemplateKind)
    : "ALL";
  const name =
    kind === "ALL"
      ? "question-import-template.csv"
      : `question-import-template-${kind.toLowerCase().replace(/_/g, "-")}.csv`;
  return csvResponse(name, questionCsvTemplate(kind));
});
