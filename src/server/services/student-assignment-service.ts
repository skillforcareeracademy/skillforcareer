import { prisma } from "@/lib/prisma";
import { notify } from "./notification-service";
import { AppError } from "@/lib/api/errors";
import type { SubmitAssignmentInput } from "@/lib/validations/submission";
import type { AssignmentAnswersInput } from "@/lib/validations/assignment";

export interface AssignmentQuestionForStudent {
  id: string;
  type: string;
  text: string;
  points: number;
  /** Choices, with the answer key stripped out. */
  options: { id: string; text: string }[];
}

export interface StudentAssignment {
  id: string;
  title: string;
  type: string;
  description: string | null;
  instructions: string | null;
  courseTitle: string | null;
  questions: AssignmentQuestionForStudent[];
  maxScore: number;
  dueDate: string | null;
  isOverdue: boolean;
  allowLate: boolean;
  submission: {
    id: string;
    status: string;
    content: string | null;
    fileUrl: string | null;
    score: number | null;
    feedback: string | null;
    submittedAt: string | null;
  } | null;
}

/**
 * The work set for one learner.
 *
 * An assignment reaches them if it names their batch, names them personally,
 * or — the original behaviour, and still the default — names nobody and simply
 * belongs to a course they're enrolled in.
 */
export async function listStudentAssignments(userId: string): Promise<StudentAssignment[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { courseId: true, batchId: true },
  });
  const courseIds = enrollments.map((e) => e.courseId);
  if (courseIds.length === 0) return [];
  const batchIds = enrollments
    .map((e) => e.batchId)
    .filter((id): id is string => Boolean(id));

  const assignments = await prisma.assignment.findMany({
    where: {
      OR: [
        // Set for the whole course — no cohort or individual named.
        {
          courseId: { in: courseIds },
          batches: { none: {} },
          students: { none: {} },
        },
        ...(batchIds.length ? [{ batches: { some: { batchId: { in: batchIds } } } }] : []),
        { students: { some: { userId } } },
      ],
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    include: {
      course: { select: { title: true } },
      submissions: { where: { studentId: userId }, orderBy: { attempt: "desc" }, take: 1 },
      questions: {
        orderBy: { order: "asc" },
        include: { options: { orderBy: { order: "asc" } } },
      },
    },
  });

  const now = Date.now();
  return assignments.map((a) => {
    const s = a.submissions[0];
    return {
      id: a.id,
      title: a.title,
      type: a.type,
      description: a.description,
      instructions: a.instructions,
      courseTitle: a.course?.title ?? null,
      // Never ship `isCorrect` to the browser — it would hand over the key.
      questions: a.questions.map((q) => ({
        id: q.id,
        type: q.type,
        text: q.text,
        points: q.points,
        options: q.options.map((o) => ({ id: o.id, text: o.text })),
      })),
      maxScore: a.maxScore,
      dueDate: a.dueDate ? a.dueDate.toISOString() : null,
      isOverdue: a.dueDate ? a.dueDate.getTime() < now : false,
      allowLate: a.allowLate,
      submission: s
        ? {
            id: s.id,
            status: s.status,
            content: s.content,
            fileUrl: s.fileUrl,
            score: s.score,
            feedback: s.feedback,
            submittedAt: s.submittedAt ? s.submittedAt.toISOString() : null,
          }
        : null,
    };
  });
}

export async function submitAssignment(
  userId: string,
  assignmentId: string,
  input: SubmitAssignmentInput,
): Promise<void> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: {
      id: true,
      courseId: true,
      dueDate: true,
      allowLate: true,
      title: true,
      course: { select: { instructorId: true } },
    },
  });
  if (!assignment) throw AppError.notFound("Assignment not found.");
  if (!assignment.courseId) throw AppError.badRequest("This assignment isn't open for submissions.");

  const enrolled = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: assignment.courseId } },
    select: { id: true },
  });
  if (!enrolled) throw AppError.forbidden("You're not enrolled in this course.");

  const existing = await prisma.assignmentSubmission.findUnique({
    where: { assignmentId_studentId_attempt: { assignmentId, studentId: userId, attempt: 1 } },
    select: { id: true, status: true },
  });
  if (existing && existing.status === "GRADED") {
    throw AppError.badRequest("This assignment is already graded.");
  }

  const now = new Date();
  const past = assignment.dueDate ? assignment.dueDate.getTime() < now.getTime() : false;
  if (past && !assignment.allowLate) {
    throw AppError.badRequest("The due date has passed and late submissions aren't allowed.");
  }
  const status = past ? "LATE" : "SUBMITTED";

  await prisma.assignmentSubmission.upsert({
    where: { assignmentId_studentId_attempt: { assignmentId, studentId: userId, attempt: 1 } },
    create: {
      assignmentId,
      studentId: userId,
      attempt: 1,
      status,
      content: input.content,
      fileUrl: input.fileUrl || null,
      submittedAt: now,
    },
    update: {
      status,
      content: input.content,
      fileUrl: input.fileUrl || null,
      submittedAt: now,
      // clear any prior grade if resubmitting after a resubmit request
      score: null,
      feedback: null,
      gradedById: null,
      gradedAt: null,
    },
  });

  // Tell whoever has to grade it. Staff see it on the assignments page anyway;
  // the instructor is the one who'd otherwise never know it landed.
  const instructorId = assignment.course?.instructorId;
  if (instructorId) {
    const student = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    await notify({
      userIds: [instructorId],
      type: "ASSIGNMENT",
      title: status === "LATE" ? "Late submission" : "New submission",
      message: `${student?.name ?? "A learner"} submitted “${assignment.title}”.`,
      actionUrl: "/instructor/assignments",
    });
  }
}

/**
 * Submit answers to an MCQ or Q&A assignment.
 *
 * Choice questions are marked here and now against the stored key; written
 * answers can't be, so they're recorded with zero points and left for a marker.
 * `autoScore` keeps what the machine awarded, so a grader who overrides it can
 * still see what it thought.
 */
export async function submitAssignmentAnswers(
  userId: string,
  assignmentId: string,
  input: AssignmentAnswersInput,
): Promise<{ autoScore: number; maxScore: number; needsMarking: boolean }> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: {
      id: true,
      courseId: true,
      title: true,
      type: true,
      gradingMode: true,
      dueDate: true,
      allowLate: true,
      course: { select: { instructorId: true } },
      questions: {
        orderBy: { order: "asc" },
        include: { options: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!assignment) throw AppError.notFound("Assignment not found.");
  if (assignment.type === "FILE") {
    throw AppError.badRequest("This assignment takes a written or uploaded submission.");
  }
  if (assignment.questions.length === 0) {
    throw AppError.badRequest("This assignment has no questions yet.");
  }
  if (!assignment.courseId) throw AppError.badRequest("This assignment isn't open for submissions.");

  const enrolled = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: assignment.courseId } },
    select: { id: true },
  });
  if (!enrolled) throw AppError.forbidden("You're not enrolled in this course.");

  const existing = await prisma.assignmentSubmission.findUnique({
    where: { assignmentId_studentId_attempt: { assignmentId, studentId: userId, attempt: 1 } },
    select: { id: true, status: true },
  });
  if (existing && existing.status === "GRADED") {
    throw AppError.badRequest("This assignment is already graded.");
  }

  const now = new Date();
  const past = assignment.dueDate ? assignment.dueDate.getTime() < now.getTime() : false;
  if (past && !assignment.allowLate) {
    throw AppError.badRequest("The due date has passed and late submissions aren't allowed.");
  }

  const given = new Map(input.answers.map((a) => [a.questionId, a]));
  let autoScore = 0;
  let maxScore = 0;
  let needsMarking = false;

  const recorded = assignment.questions.map((q) => {
    maxScore += q.points;
    const answer = given.get(q.id);
    const optionIds = answer?.optionIds ?? [];
    const text = answer?.text ?? "";

    if (q.type === "SHORT_ANSWER") {
      needsMarking = true;
      return { questionId: q.id, optionIds: [], text, points: 0, isCorrect: null };
    }

    const correct = q.options.filter((o) => o.isCorrect).map((o) => o.id).sort();
    const chosen = [...optionIds].sort();
    const isCorrect =
      correct.length === chosen.length && correct.every((id, i) => id === chosen[i]);
    const points = isCorrect ? q.points : 0;
    autoScore += points;
    return { questionId: q.id, optionIds, text, points, isCorrect };
  });

  // Auto-marked papers with no written questions are done the moment they land.
  const settled = assignment.gradingMode === "AUTO" && !needsMarking;
  const status = settled ? "GRADED" : past ? "LATE" : "SUBMITTED";

  await prisma.assignmentSubmission.upsert({
    where: { assignmentId_studentId_attempt: { assignmentId, studentId: userId, attempt: 1 } },
    create: {
      assignmentId,
      studentId: userId,
      attempt: 1,
      status,
      answers: recorded,
      fileUrl: input.fileUrl || null,
      autoScore,
      score: settled ? autoScore : null,
      submittedAt: now,
      gradedAt: settled ? now : null,
    },
    update: {
      status,
      answers: recorded,
      fileUrl: input.fileUrl || null,
      autoScore,
      score: settled ? autoScore : null,
      submittedAt: now,
      feedback: null,
      gradedById: null,
      gradedAt: settled ? now : null,
    },
  });

  if (!settled) {
    const instructorId = assignment.course?.instructorId;
    if (instructorId) {
      const student = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      await notify({
        userIds: [instructorId],
        type: "ASSIGNMENT",
        title: "New submission to mark",
        message: `${student?.name ?? "A learner"} submitted “${assignment.title}”.`,
        actionUrl: "/instructor/assignments",
      });
    }
  }

  return { autoScore, maxScore, needsMarking };
}
