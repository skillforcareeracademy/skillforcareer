import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import type { AssignmentInput, GradeSubmissionInput } from "@/lib/validations/assignment";

function toDate(value?: string): Date | null {
  return value ? new Date(value) : null;
}

// ── Reads ────────────────────────────────────────────────────────────────────

export interface AssignmentListQuery {
  page: number;
  pageSize: number;
  search?: string;
  courseId?: string;
  /** Scope to assignments in one instructor's courses. */
  instructorId?: string;
}

export async function listAssignmentsAdmin(q: AssignmentListQuery) {
  const and: Prisma.AssignmentWhereInput[] = [];
  if (q.search) and.push({ title: { contains: q.search } });
  if (q.courseId) and.push({ courseId: q.courseId });
  if (q.instructorId) and.push({ course: { instructorId: q.instructorId } });
  const where: Prisma.AssignmentWhereInput = and.length ? { AND: and } : {};

  const [total, rows] = await Promise.all([
    prisma.assignment.count({ where }),
    prisma.assignment.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        course: { select: { title: true } },
        createdBy: { select: { name: true } },
        _count: {
          select: {
            submissions: true,
          },
        },
        submissions: {
          where: { status: { in: ["SUBMITTED", "LATE"] } },
          select: { id: true },
        },
      },
    }),
  ]);

  return {
    total,
    assignments: rows.map((a) => ({
      id: a.id,
      title: a.title,
      courseId: a.courseId,
      courseTitle: a.course?.title ?? null,
      createdByName: a.createdBy.name,
      maxScore: a.maxScore,
      dueDate: a.dueDate ? a.dueDate.toISOString() : null,
      isOverdue: a.dueDate ? a.dueDate.getTime() < Date.now() : false,
      allowLate: a.allowLate,
      submissions: a._count.submissions,
      needsGrading: a.submissions.length,
    })),
  };
}

export interface AssignmentStats {
  total: number;
  upcoming: number;
  submissions: number;
  needsGrading: number;
}

export async function assignmentStats(instructorId?: string): Promise<AssignmentStats> {
  const aScope: Prisma.AssignmentWhereInput = instructorId ? { course: { instructorId } } : {};
  const sScope: Prisma.AssignmentSubmissionWhereInput = instructorId
    ? { assignment: { course: { instructorId } } }
    : {};
  const [total, upcoming, submissions, needsGrading] = await Promise.all([
    prisma.assignment.count({ where: aScope }),
    prisma.assignment.count({ where: { ...aScope, dueDate: { gte: new Date() } } }),
    prisma.assignmentSubmission.count({ where: sScope }),
    prisma.assignmentSubmission.count({
      where: { ...sScope, status: { in: ["SUBMITTED", "LATE"] } },
    }),
  ]);
  return { total, upcoming, submissions, needsGrading };
}

export async function getAssignmentDetail(id: string) {
  const a = await prisma.assignment.findUnique({
    where: { id },
    include: {
      course: { select: { title: true, slug: true } },
      createdBy: { select: { name: true, avatarUrl: true } },
      submissions: {
        take: 200,
        orderBy: { submittedAt: "desc" },
        include: { student: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      },
    },
  });
  if (!a) throw AppError.notFound("Assignment not found.");

  return {
    id: a.id,
    title: a.title,
    description: a.description,
    instructions: a.instructions,
    maxScore: a.maxScore,
    dueDate: a.dueDate ? a.dueDate.toISOString() : null,
    allowLate: a.allowLate,
    course: a.course,
    createdBy: a.createdBy,
    submissions: a.submissions.map((s) => ({
      id: s.id,
      status: s.status,
      score: s.score,
      feedback: s.feedback,
      submittedAt: s.submittedAt ? s.submittedAt.toISOString() : null,
      student: s.student,
    })),
  };
}

export async function listCoursesForSelect(instructorId?: string) {
  return prisma.course.findMany({
    where: instructorId ? { instructorId } : {},
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
}

// ── Writes ───────────────────────────────────────────────────────────────────

export async function createAssignment(input: AssignmentInput, createdById: string): Promise<string> {
  const a = await prisma.assignment.create({
    data: {
      title: input.title,
      description: input.description || null,
      instructions: input.instructions || null,
      courseId: input.courseId || null,
      createdById,
      maxScore: input.maxScore,
      dueDate: toDate(input.dueDate),
      allowLate: input.allowLate,
    },
    select: { id: true },
  });
  return a.id;
}

export async function updateAssignment(id: string, input: AssignmentInput): Promise<void> {
  const existing = await prisma.assignment.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Assignment not found.");
  await prisma.assignment.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description || null,
      instructions: input.instructions || null,
      courseId: input.courseId || null,
      maxScore: input.maxScore,
      dueDate: toDate(input.dueDate),
      allowLate: input.allowLate,
    },
  });
}

export async function deleteAssignment(id: string): Promise<void> {
  const existing = await prisma.assignment.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Assignment not found.");
  await prisma.assignment.delete({ where: { id } });
}

export async function gradeSubmission(
  submissionId: string,
  input: GradeSubmissionInput,
  graderId: string,
): Promise<void> {
  const sub = await prisma.assignmentSubmission.findUnique({
    where: { id: submissionId },
    select: { id: true, assignment: { select: { maxScore: true } } },
  });
  if (!sub) throw AppError.notFound("Submission not found.");
  if (input.score > sub.assignment.maxScore) {
    throw AppError.badRequest(`Score can't exceed the maximum of ${sub.assignment.maxScore}.`);
  }
  await prisma.assignmentSubmission.update({
    where: { id: submissionId },
    data: {
      score: input.score,
      feedback: input.feedback || null,
      status: input.status,
      gradedById: graderId,
      gradedAt: new Date(),
    },
  });
}
