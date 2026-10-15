import { withRoute } from "@/lib/api/handler";
import { requireApiPermission, isStaffRole } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { toCsv } from "@/lib/csv";
import { quizzesForBundle, exportQuestions } from "@/server/services/quiz-service";
import { streamZip } from "@/server/services/export-zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const str = (v: string | null) => (v && v.trim() ? v.trim() : undefined);
const safe = (s: string) => s.replace(/[\/\\]/g, "-").slice(0, 100);

/**
 * The quizzes as a ZIP: a manifest spreadsheet at the root, and every paper's
 * full question bank — text, options, correct answers and explanations — as its
 * own sheet. "Quiz … export including pdfs and files."
 */
export const GET = withRoute(async (req) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_QUIZ);
  const sp = new URL(req.url).searchParams;
  const columns = sp.get("columns")?.split(",").map((c) => c.trim()).filter(Boolean);

  const { csv, quizzes } = await quizzesForBundle(
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

  const stamp = new Date().toISOString().slice(0, 10);
  return streamZip(`quizzes-${stamp}.zip`, async (add) => {
    await add({ path: "quizzes.csv", content: csv });

    for (const quiz of quizzes) {
      const { questions } = await exportQuestions(quiz.id);
      if (questions.length === 0) continue;
      // One row per option so a grid holds everything; the question repeats.
      const rows: (string | number)[][] = [];
      questions.forEach((q, i) => {
        const base = [i + 1, q.type, q.text, q.points, q.correctAnswer, q.explanation];
        if (q.options.length === 0) {
          rows.push([...base, "", ""]);
        } else {
          q.options.forEach((o) => rows.push([...base, o.text, o.isCorrect ? "correct" : ""]));
        }
      });
      const sheet = toCsv(
        ["No.", "Type", "Question", "Points", "Correct answer", "Explanation", "Option", "Is correct"],
        rows,
      );
      await add({
        path: `questions/Q${String(quiz.quizNo).padStart(3, "0")} ${safe(quiz.title)}.csv`,
        content: sheet,
      });
    }
  });
});
