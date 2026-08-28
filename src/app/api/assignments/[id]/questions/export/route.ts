import { withRoute } from "@/lib/api/handler";
import { AppError } from "@/lib/api/errors";
import { requireApiPermission, isStaffRole } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { csvResponse } from "@/lib/csv";
import { questionsToCsv, type BankQuestion } from "@/lib/question-csv";
import { exportAssignmentQuestions } from "@/server/services/assignment-service";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(title: string): string {
  return (
    title
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "assignment"
  );
}

/**
 * Download the question bank as a spreadsheet — the same columns the importer
 * reads, so a paper can be exported, edited in Excel and imported back.
 *
 * Staff only: an export carries every model answer and correct option, so it is
 * the answer key. Instructors can import a paper but not take one away.
 */
export const GET = withRoute(async (_req, { params }) => {
  const user = await requireApiPermission(PERMISSIONS.GRADE_ASSIGNMENT);
  if (!isStaffRole(user.role)) {
    throw AppError.forbidden("Only admins can export questions.");
  }
  const id = String((await params).id);

  const [{ questions }, assignment] = await Promise.all([
    exportAssignmentQuestions(id),
    prisma.assignment.findUnique({ where: { id }, select: { title: true } }),
  ]);

  const name = `${slugify(assignment?.title ?? "assignment")}-questions.csv`;
  return csvResponse(name, questionsToCsv(questions as BankQuestion[]));
});
