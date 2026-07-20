import { prisma } from "@/lib/prisma";
import { notify } from "./notification-service";
import { AppError } from "@/lib/api/errors";
import type { SubmitAssignmentInput } from "@/lib/validations/submission";

export interface StudentAssignment {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  courseTitle: string | null;
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

export async function listStudentAssignments(userId: string): Promise<StudentAssignment[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { courseId: true },
  });
  const courseIds = enrollments.map((e) => e.courseId);
  if (courseIds.length === 0) return [];

  const assignments = await prisma.assignment.findMany({
    where: { courseId: { in: courseIds } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    include: {
      course: { select: { title: true } },
      submissions: { where: { studentId: userId }, orderBy: { attempt: "desc" }, take: 1 },
    },
  });

  const now = Date.now();
  return assignments.map((a) => {
    const s = a.submissions[0];
    return {
      id: a.id,
      title: a.title,
      description: a.description,
      instructions: a.instructions,
      courseTitle: a.course?.title ?? null,
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
