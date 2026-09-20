import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { notify } from "./notification-service";

/**
 * Setting an existing quiz or assignment for a batch from the batch profile,
 * and taking it off again.
 *
 * The audience rule these rows feed is "no batch rows and no named learners =
 * everyone on the course". So setting a course-wide quiz for one batch narrows
 * it to that batch, and removing a quiz's last batch opens it back up to the
 * whole course. The profile explains both before the admin confirms; here the
 * rule is only kept honest (same course, no duplicate rows).
 */

async function batchCourse(batchId: string) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { id: true, name: true, courseId: true },
  });
  if (!batch) throw AppError.notFound("Batch not found.");
  return batch;
}

async function batchLearnerIds(batchId: string): Promise<string[]> {
  const rows = await prisma.enrollment.findMany({
    where: { batchId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

export async function assignQuizToBatch(
  batchId: string,
  quizId: string,
): Promise<void> {
  const [batch, quiz] = await Promise.all([
    batchCourse(batchId),
    prisma.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        title: true,
        courseId: true,
        isPublished: true,
        releaseAt: true,
      },
    }),
  ]);
  if (!quiz) throw AppError.notFound("Quiz not found.");
  if (quiz.courseId !== batch.courseId) {
    throw AppError.badRequest(
      "Only quizzes from this batch's course can be set for it.",
    );
  }

  const { count } = await prisma.quizBatch.createMany({
    data: [{ quizId, batchId }],
    skipDuplicates: true,
  });
  if (count === 0) return;

  // Tell the batch only when there is something they can open today.
  const live =
    quiz.isPublished && (!quiz.releaseAt || quiz.releaseAt <= new Date());
  if (live) {
    await notify({
      userIds: await batchLearnerIds(batchId),
      type: "QUIZ",
      title: "New quiz",
      message: `“${quiz.title}” has been set for ${batch.name}.`,
      actionUrl: "/student/quizzes",
    });
  }
}

export async function unassignQuizFromBatch(
  batchId: string,
  quizId: string,
): Promise<void> {
  await prisma.quizBatch.deleteMany({ where: { quizId, batchId } });
}

export async function assignAssignmentToBatch(
  batchId: string,
  assignmentId: string,
): Promise<void> {
  const [batch, assignment] = await Promise.all([
    batchCourse(batchId),
    prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, title: true, courseId: true, releaseAt: true },
    }),
  ]);
  if (!assignment) throw AppError.notFound("Assignment not found.");
  if (assignment.courseId !== batch.courseId) {
    throw AppError.badRequest(
      "Only assignments from this batch's course can be set for it.",
    );
  }

  const { count } = await prisma.assignmentBatch.createMany({
    data: [{ assignmentId, batchId }],
    skipDuplicates: true,
  });
  if (count === 0) return;

  if (!assignment.releaseAt || assignment.releaseAt <= new Date()) {
    await notify({
      userIds: await batchLearnerIds(batchId),
      type: "ASSIGNMENT",
      title: "New assignment",
      message: `“${assignment.title}” has been set for ${batch.name}.`,
      actionUrl: "/student/assignments",
    });
  }
}

export async function unassignAssignmentFromBatch(
  batchId: string,
  assignmentId: string,
): Promise<void> {
  await prisma.assignmentBatch.deleteMany({ where: { assignmentId, batchId } });
}
