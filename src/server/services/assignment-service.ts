import { prisma } from "@/lib/prisma";
import { notify } from "./notification-service";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import type {
  AssignmentInput,
  GradeSubmissionInput,
  AssignmentQuestionInput,
  ImportAssignmentQuestionsInput,
} from "@/lib/validations/assignment";

function toDate(value?: string): Date | null {
  return value ? new Date(value) : null;
}

// ── Reads ────────────────────────────────────────────────────────────────────

export interface AssignmentListQuery {
  page: number;
  pageSize: number;
  search?: string;
  courseId?: string;
  /** Only assignments set for this cohort. */
  batchId?: string;
  /** Due-date window, as `yyyy-MM-dd` from a date input. */
  dueFrom?: string;
  dueTo?: string;
  type?: string;
  /** Scope to assignments in one instructor's courses. */
  instructorId?: string;
}

/** `yyyy-MM-dd` → the instant that day starts / ends, in the server's zone. */
function dayStart(value?: string): Date | undefined {
  return value ? new Date(`${value}T00:00:00`) : undefined;
}
function dayEnd(value?: string): Date | undefined {
  return value ? new Date(`${value}T23:59:59.999`) : undefined;
}

export async function listAssignmentsAdmin(q: AssignmentListQuery) {
  const and: Prisma.AssignmentWhereInput[] = [];
  if (q.search) and.push({ title: { contains: q.search } });
  if (q.courseId) and.push({ courseId: q.courseId });
  if (q.batchId) and.push({ batches: { some: { batchId: q.batchId } } });
  if (q.type) and.push({ type: q.type as Prisma.AssignmentWhereInput["type"] });
  const from = dayStart(q.dueFrom);
  const to = dayEnd(q.dueTo);
  if (from || to) {
    and.push({ dueDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
  }
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
        batches: { select: { batch: { select: { id: true, name: true } } } },
      },
    }),
  ]);

  return {
    total,
    assignments: rows.map((a) => ({
      id: a.id,
      title: a.title,
      type: a.type,
      gradingMode: a.gradingMode,
      courseId: a.courseId,
      courseTitle: a.course?.title ?? null,
      batchIds: a.batches.map((b) => b.batch.id),
      batchNames: a.batches.map((b) => b.batch.name),
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

/**
 * Full assignment view for the admin sheet: the paper, who it's set for, and
 * every submission — each tagged with the learner's batch, so submissions can
 * be read cohort by cohort.
 */
export async function getAssignmentDetail(id: string) {
  const a = await prisma.assignment.findUnique({
    where: { id },
    include: {
      course: { select: { title: true, slug: true } },
      createdBy: { select: { name: true, avatarUrl: true } },
      submissions: {
        take: 500,
        orderBy: { submittedAt: "desc" },
        include: { student: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      },
      questions: {
        orderBy: { order: "asc" },
        include: { options: { orderBy: { order: "asc" } } },
      },
      batches: { select: { batch: { select: { id: true, name: true } } } },
      students: {
        select: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });
  if (!a) throw AppError.notFound("Assignment not found.");

  // Which cohort each submitter belongs to, for the batch filter on the sheet.
  const studentIds = a.submissions.map((s) => s.studentId);
  const enrolments =
    a.courseId && studentIds.length > 0
      ? await prisma.enrollment.findMany({
          where: { courseId: a.courseId, userId: { in: studentIds } },
          select: { userId: true, batchId: true, batch: { select: { name: true } } },
        })
      : [];
  const batchByUser = new Map(
    enrolments.map((e) => [e.userId, { id: e.batchId, name: e.batch?.name ?? null }]),
  );

  return {
    id: a.id,
    title: a.title,
    type: a.type,
    gradingMode: a.gradingMode,
    description: a.description,
    instructions: a.instructions,
    maxScore: a.maxScore,
    dueDate: a.dueDate ? a.dueDate.toISOString() : null,
    allowLate: a.allowLate,
    courseId: a.courseId,
    course: a.course,
    createdBy: a.createdBy,
    batches: a.batches.map((b) => b.batch),
    students: a.students.map((s) => s.user),
    questions: a.questions.map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      points: q.points,
      order: q.order,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      options: q.options.map((o) => ({
        id: o.id,
        text: o.text,
        isCorrect: o.isCorrect,
        order: o.order,
      })),
    })),
    submissions: a.submissions.map((s) => ({
      id: s.id,
      status: s.status,
      score: s.score,
      autoScore: s.autoScore,
      feedback: s.feedback,
      content: s.content,
      fileUrl: s.fileUrl,
      answers: s.answers,
      submittedAt: s.submittedAt ? s.submittedAt.toISOString() : null,
      student: s.student,
      batchId: batchByUser.get(s.studentId)?.id ?? null,
      batchName: batchByUser.get(s.studentId)?.name ?? null,
    })),
  };
}

/** Cohorts to offer when setting an assignment (all, or one course's). */
export async function listBatchesForSelect(courseId?: string, instructorId?: string) {
  const rows = await prisma.batch.findMany({
    where: {
      ...(courseId ? { courseId } : {}),
      ...(instructorId ? { course: { instructorId } } : {}),
    },
    select: { id: true, name: true, courseId: true, course: { select: { title: true } } },
    orderBy: [{ startDate: "desc" }, { name: "asc" }],
    take: 300,
  });
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    courseId: b.courseId,
    courseTitle: b.course.title,
  }));
}

/**
 * Learners who can be set an assignment individually. Scoped to a course when
 * one is chosen — setting work for someone with no access to it helps nobody.
 */
export async function listStudentsForSelect(courseId?: string, search?: string) {
  const rows = await prisma.user.findMany({
    where: {
      ...(courseId ? { enrollments: { some: { courseId } } } : {}),
      ...(search
        ? { OR: [{ name: { contains: search } }, { email: { contains: search } }] }
        : {}),
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
    take: 200,
  });
  return rows;
}

export async function listCoursesForSelect(instructorId?: string) {
  return prisma.course.findMany({
    where: instructorId ? { instructorId } : {},
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
}

// ── Writes ───────────────────────────────────────────────────────────────────

function coreData(input: AssignmentInput) {
  return {
    title: input.title,
    description: input.description || null,
    instructions: input.instructions || null,
    courseId: input.courseId || null,
    type: input.type,
    // Written answers always need a human — the schema refuses AUTO for them,
    // but be explicit here too so a direct service call can't slip past it.
    gradingMode: input.type === "QNA" ? ("MANUAL" as const) : input.gradingMode,
    maxScore: input.maxScore,
    dueDate: toDate(input.dueDate),
    allowLate: input.allowLate,
  };
}

/**
 * Replace an assignment's audience. Rows are deleted and re-created rather than
 * diffed: the lists are tens of entries at most, and two statements beat a
 * per-row reconciliation against a database a region away.
 */
async function setAudience(
  assignmentId: string,
  batchIds: string[] | undefined,
  studentIds: string[] | undefined,
): Promise<void> {
  const batches = [...new Set(batchIds ?? [])];
  const students = [...new Set(studentIds ?? [])];

  await prisma.$transaction([
    prisma.assignmentBatch.deleteMany({ where: { assignmentId } }),
    prisma.assignmentStudent.deleteMany({ where: { assignmentId } }),
    ...(batches.length
      ? [
          prisma.assignmentBatch.createMany({
            data: batches.map((batchId) => ({ assignmentId, batchId })),
          }),
        ]
      : []),
    ...(students.length
      ? [
          prisma.assignmentStudent.createMany({
            data: students.map((userId) => ({ assignmentId, userId })),
          }),
        ]
      : []),
  ]);
}

export async function createAssignment(input: AssignmentInput, createdById: string): Promise<string> {
  const a = await prisma.assignment.create({
    data: { ...coreData(input), createdById },
    select: { id: true },
  });
  await setAudience(a.id, input.batchIds, input.studentIds);
  await announceAssignment(a.id);
  return a.id;
}

export async function updateAssignment(id: string, input: AssignmentInput): Promise<void> {
  const existing = await prisma.assignment.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Assignment not found.");
  await prisma.assignment.update({ where: { id }, data: coreData(input) });
  await setAudience(id, input.batchIds, input.studentIds);
}

/**
 * Everyone an assignment is set for: the chosen cohorts plus any individuals,
 * or — when neither is chosen — everyone enrolled on the course.
 */
export async function assignmentAudienceUserIds(assignmentId: string): Promise<string[]> {
  const a = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: {
      courseId: true,
      batches: { select: { batchId: true } },
      students: { select: { userId: true } },
    },
  });
  if (!a) return [];

  const ids = new Set(a.students.map((s) => s.userId));
  const batchIds = a.batches.map((b) => b.batchId);

  if (batchIds.length > 0) {
    const rows = await prisma.enrollment.findMany({
      where: { batchId: { in: batchIds }, status: { in: ["ACTIVE", "COMPLETED"] } },
      select: { userId: true },
    });
    rows.forEach((r) => ids.add(r.userId));
  } else if (ids.size === 0 && a.courseId) {
    const rows = await prisma.enrollment.findMany({
      where: { courseId: a.courseId, status: { in: ["ACTIVE", "COMPLETED"] } },
      select: { userId: true },
    });
    rows.forEach((r) => ids.add(r.userId));
  }
  return [...ids];
}

/** Tell the learners it was set for that there's new work. Best effort. */
async function announceAssignment(assignmentId: string): Promise<void> {
  const a = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { title: true },
  });
  if (!a) return;
  const userIds = await assignmentAudienceUserIds(assignmentId);
  if (userIds.length === 0) return;
  await notify({
    userIds,
    type: "ASSIGNMENT",
    title: "New assignment",
    message: `“${a.title}” has been set for you.`,
    actionUrl: "/student/assignments",
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
    select: {
      id: true,
      studentId: true,
      assignment: { select: { maxScore: true, title: true } },
    },
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

  await notify({
    userIds: [sub.studentId],
    type: "ASSIGNMENT",
    title: "Assignment graded",
    message: `“${sub.assignment.title}” — you scored ${input.score}/${sub.assignment.maxScore}.`,
    actionUrl: "/student/assignments",
  });
}

// ── Questions (MCQ / Q&A papers) ──────────────────────────────────────────────

export interface AssignmentQuestionRow {
  id: string;
  type: string;
  text: string;
  points: number;
  order: number;
  correctAnswer: string | null;
  explanation: string | null;
  options: { id: string; text: string; isCorrect: boolean; order: number }[];
}

export async function listAssignmentQuestions(
  assignmentId: string,
): Promise<AssignmentQuestionRow[]> {
  const rows = await prisma.assignmentQuestion.findMany({
    where: { assignmentId },
    orderBy: { order: "asc" },
    include: { options: { orderBy: { order: "asc" } } },
  });
  return rows.map((q) => ({
    id: q.id,
    type: q.type,
    text: q.text,
    points: q.points,
    order: q.order,
    correctAnswer: q.correctAnswer,
    explanation: q.explanation,
    options: q.options.map((o) => ({
      id: o.id,
      text: o.text,
      isCorrect: o.isCorrect,
      order: o.order,
    })),
  }));
}

/** Options belong to choice questions only — a written answer has none. */
function optionData(input: AssignmentQuestionInput) {
  if (input.type === "SHORT_ANSWER") return [];
  return input.options.map((o, i) => ({
    text: o.text,
    isCorrect: o.isCorrect,
    order: i,
  }));
}

export async function addAssignmentQuestion(
  assignmentId: string,
  input: AssignmentQuestionInput,
): Promise<string> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { id: true },
  });
  if (!assignment) throw AppError.notFound("Assignment not found.");

  const last = await prisma.assignmentQuestion.findFirst({
    where: { assignmentId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const q = await prisma.assignmentQuestion.create({
    data: {
      assignmentId,
      type: input.type,
      text: input.text,
      points: input.points,
      order: (last?.order ?? -1) + 1,
      correctAnswer: input.correctAnswer || null,
      explanation: input.explanation || null,
      options: { create: optionData(input) },
    },
    select: { id: true },
  });
  await syncMaxScore(assignmentId);
  return q.id;
}

export async function updateAssignmentQuestion(
  questionId: string,
  input: AssignmentQuestionInput,
): Promise<void> {
  const existing = await prisma.assignmentQuestion.findUnique({
    where: { id: questionId },
    select: { id: true, assignmentId: true },
  });
  if (!existing) throw AppError.notFound("Question not found.");

  // Options are replaced wholesale — editing a question's choices in place
  // would leave stale ids in any submission that referenced them anyway.
  await prisma.assignmentQuestionOption.deleteMany({ where: { questionId } });
  await prisma.assignmentQuestion.update({
    where: { id: questionId },
    data: {
      type: input.type,
      text: input.text,
      points: input.points,
      correctAnswer: input.correctAnswer || null,
      explanation: input.explanation || null,
      options: { create: optionData(input) },
    },
  });
  await syncMaxScore(existing.assignmentId);
}

export async function deleteAssignmentQuestion(questionId: string): Promise<void> {
  const existing = await prisma.assignmentQuestion.findUnique({
    where: { id: questionId },
    select: { assignmentId: true },
  });
  if (!existing) return;
  await prisma.assignmentQuestion.delete({ where: { id: questionId } });
  await syncMaxScore(existing.assignmentId);
}

export async function reorderAssignmentQuestions(
  assignmentId: string,
  ids: string[],
): Promise<void> {
  await prisma.$transaction(
    ids.map((id, order) =>
      prisma.assignmentQuestion.updateMany({ where: { id, assignmentId }, data: { order } }),
    ),
  );
}

/**
 * Keep `maxScore` equal to the paper's total once it has questions, so the
 * grade a learner sees is out of what the paper is actually worth.
 */
async function syncMaxScore(assignmentId: string): Promise<void> {
  const agg = await prisma.assignmentQuestion.aggregate({
    where: { assignmentId },
    _sum: { points: true },
  });
  const total = agg._sum.points ?? 0;
  if (total > 0) {
    await prisma.assignment.update({ where: { id: assignmentId }, data: { maxScore: total } });
  }
}

/** The question bank in the shape `importAssignmentQuestions` reads back. */
export async function exportAssignmentQuestions(assignmentId: string) {
  const rows = await listAssignmentQuestions(assignmentId);
  return {
    questions: rows.map((q) => ({
      type: q.type,
      text: q.text,
      points: q.points,
      correctAnswer: q.correctAnswer ?? "",
      explanation: q.explanation ?? "",
      options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
    })),
  };
}

export async function importAssignmentQuestions(
  assignmentId: string,
  input: ImportAssignmentQuestionsInput,
): Promise<number> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { id: true },
  });
  if (!assignment) throw AppError.notFound("Assignment not found.");

  if (input.replace) {
    await prisma.assignmentQuestion.deleteMany({ where: { assignmentId } });
  }
  const last = input.replace
    ? null
    : await prisma.assignmentQuestion.findFirst({
        where: { assignmentId },
        orderBy: { order: "desc" },
        select: { order: true },
      });

  let order = (last?.order ?? -1) + 1;
  // Sequential rather than a single createMany: each question owns its options,
  // and nested creates are the only way to write both in one statement each.
  for (const q of input.questions) {
    await prisma.assignmentQuestion.create({
      data: {
        assignmentId,
        type: q.type,
        text: q.text,
        points: q.points,
        order: order++,
        correctAnswer: q.correctAnswer || null,
        explanation: q.explanation || null,
        options: { create: optionData(q) },
      },
    });
  }
  await syncMaxScore(assignmentId);
  return input.questions.length;
}
