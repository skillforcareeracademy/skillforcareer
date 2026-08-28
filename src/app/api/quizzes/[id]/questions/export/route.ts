import { withRoute } from "@/lib/api/handler";
import { AppError } from "@/lib/api/errors";
import { requireApiPermission, isStaffRole } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { csvResponse } from "@/lib/csv";
import { questionsToCsv, type BankQuestion } from "@/lib/question-csv";
import { exportQuestions } from "@/server/services/quiz-service";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A filename the admin will recognise in their downloads folder. */
function slugify(title: string): string {
  return (
    title
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "quiz"
  );
}

/**
 * Download the question bank as a spreadsheet.
 *
 * CSV, not JSON: a question paper is something the client writes in Excel and
 * mails around, and the JSON download was the thing they kept reporting. The
 * columns are the same ones the importer reads, so export → edit → import
 * round-trips.
 *
 * Staff only: the export carries every correct option and model answer, so it
 * is the answer key. Instructors may import a bank but not take one away.
 */
export const GET = withRoute(async (_req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_QUIZ);
  if (!isStaffRole(user.role)) {
    throw AppError.forbidden("Only admins can export questions.");
  }
  const id = String((await params).id);

  const [{ questions }, quiz] = await Promise.all([
    exportQuestions(id),
    prisma.quiz.findUnique({ where: { id }, select: { title: true } }),
  ]);

  const name = `${slugify(quiz?.title ?? "quiz")}-questions.csv`;
  return csvResponse(name, questionsToCsv(questions as BankQuestion[]));
});
