import { prisma } from "@/lib/prisma";

export interface InstructorStats {
  courses: number;
  students: number;
  pendingGrading: number;
  liveClasses: number;
}

/** Headline metrics scoped to one instructor's own courses/classes. */
export async function getInstructorStats(instructorId: string): Promise<InstructorStats> {
  const [courses, learners, pendingGrading, liveClasses] = await Promise.all([
    prisma.course.count({ where: { instructorId } }),
    prisma.enrollment.findMany({
      where: { course: { instructorId } },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.assignmentSubmission.count({
      where: {
        status: { in: ["SUBMITTED", "LATE"] },
        assignment: { course: { instructorId } },
      },
    }),
    prisma.meeting.count({
      where: { hostId: instructorId, status: { in: ["SCHEDULED", "LIVE"] } },
    }),
  ]);
  return { courses, students: learners.length, pendingGrading, liveClasses };
}

export interface InstructorClass {
  id: string;
  title: string;
  status: string;
  roomCode: string;
  courseTitle: string | null;
  scheduledStart: string;
}

/** The instructor's own upcoming/live classes (soonest first). */
export async function getInstructorUpcomingClasses(
  instructorId: string,
  limit = 5,
): Promise<InstructorClass[]> {
  const rows = await prisma.meeting.findMany({
    where: { hostId: instructorId, status: { in: ["SCHEDULED", "LIVE"] } },
    orderBy: { scheduledStart: "asc" },
    take: limit,
    include: { course: { select: { title: true } } },
  });
  return rows.map((m) => ({
    id: m.id,
    title: m.title,
    status: m.status,
    roomCode: m.roomCode,
    courseTitle: m.course?.title ?? null,
    scheduledStart: m.scheduledStart.toISOString(),
  }));
}

export interface GradingItem {
  id: string;
  studentName: string;
  studentAvatar: string | null;
  assignmentTitle: string;
  courseTitle: string | null;
  status: string;
  submittedAt: string | null;
}

/** Submissions in the instructor's courses awaiting a grade (oldest first). */
export async function getSubmissionsToGrade(
  instructorId: string,
  limit = 6,
): Promise<GradingItem[]> {
  const rows = await prisma.assignmentSubmission.findMany({
    where: {
      status: { in: ["SUBMITTED", "LATE"] },
      assignment: { course: { instructorId } },
    },
    orderBy: { submittedAt: "asc" },
    take: limit,
    include: {
      student: { select: { name: true, avatarUrl: true } },
      assignment: { select: { title: true, course: { select: { title: true } } } },
    },
  });
  return rows.map((s) => ({
    id: s.id,
    studentName: s.student.name,
    studentAvatar: s.student.avatarUrl,
    assignmentTitle: s.assignment.title,
    courseTitle: s.assignment.course?.title ?? null,
    status: s.status,
    submittedAt: s.submittedAt ? s.submittedAt.toISOString() : null,
  }));
}

export interface InstructorCourseRow {
  id: string;
  title: string;
  status: string;
  enrollments: number;
}

export async function getInstructorTopCourses(
  instructorId: string,
  limit = 5,
): Promise<InstructorCourseRow[]> {
  const rows = await prisma.course.findMany({
    where: { instructorId },
    orderBy: { enrollmentCount: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      status: true,
      enrollmentCount: true,
      _count: { select: { enrollments: true } },
    },
  });
  return rows.map((c) => ({
    id: c.id,
    title: c.title,
    status: c.status,
    enrollments: c._count.enrollments || c.enrollmentCount,
  }));
}
