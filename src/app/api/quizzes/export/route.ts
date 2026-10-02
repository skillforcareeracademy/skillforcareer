import { withRoute } from "@/lib/api/handler";
import { requireApiPermission, isStaffRole } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { csvResponse } from "@/lib/csv";
import { exportQuizzes, quizSampleSheet } from "@/server/services/quiz-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const str = (v: string | null) => (v && v.trim() ? v.trim() : undefined);

/**
 * The quiz list as a spreadsheet, narrowed and column-picked by the export
 * dialog. `sample=1` gives the same columns with one example row, ready to fill
 * in and import.
 *
 * Unlike a question export this carries no answers, so an instructor may take
 * their own papers away; the scope narrows to theirs.
 */
export const GET = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_QUIZ);
  const sp = new URL(req.url).searchParams;
  const columns = sp.get("columns")?.split(",").map((c) => c.trim()).filter(Boolean);

  if (sp.get("sample") === "1") {
    return csvResponse("quizzes-sample.csv", quizSampleSheet(columns));
  }

  const csv = await exportQuizzes(
    {
      columns,
      search: str(sp.get("search")),
      groupId: str(sp.get("group")),
      courseId: str(sp.get("course")),
      batchId: str(sp.get("batch")),
      status: str(sp.get("status")),
      difficulty: str(sp.get("difficulty")),
      ids: sp.get("ids")?.split(",").map((i) => i.trim()).filter(Boolean),
      createdFrom: str(sp.get("from")),
      createdTo: str(sp.get("to")),
    },
    isStaffRole(user.role) ? undefined : user.id,
  );
  return csvResponse("quizzes.csv", csv);
});
