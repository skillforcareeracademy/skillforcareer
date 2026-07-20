import { prisma } from "@/lib/prisma";
import { notify } from "./notification-service";
import { AppError } from "@/lib/api/errors";

export async function isEnrolled(userId: string, courseId: string): Promise<boolean> {
  const e = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { id: true },
  });
  return Boolean(e);
}

/** Enroll the current user in a course. Returns the course slug to continue to. */
export async function enrollInCourse(userId: string, courseId: string): Promise<{ slug: string }> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, slug: true, status: true, title: true },
  });
  if (!course) throw AppError.notFound("Course not found.");
  if (course.status !== "PUBLISHED") throw AppError.badRequest("This course isn't available yet.");

  const existing = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { id: true },
  });
  if (existing) return { slug: course.slug };

  await prisma.$transaction([
    prisma.enrollment.create({ data: { userId, courseId, status: "ACTIVE" } }),
    prisma.course.update({ where: { id: courseId }, data: { enrollmentCount: { increment: 1 } } }),
  ]);

  await notify({
    userIds: [userId],
    type: "COURSE",
    title: "You're enrolled",
    message: `You now have access to “${course.title}”. Start learning any time.`,
    actionUrl: `/student/learn/${course.slug}`,
  });

  return { slug: course.slug };
}

export interface LearningStats {
  enrolled: number;
  inProgress: number;
  completed: number;
  certificates: number;
}

export async function getLearningStats(userId: string): Promise<LearningStats> {
  const [enrolled, completed, inProgress, certificates] = await Promise.all([
    prisma.enrollment.count({ where: { userId } }),
    prisma.enrollment.count({ where: { userId, status: "COMPLETED" } }),
    prisma.enrollment.count({ where: { userId, status: "ACTIVE", progressPercent: { gt: 0 } } }),
    prisma.certificate.count({ where: { userId, status: "ISSUED" } }),
  ]);
  return { enrolled, inProgress, completed, certificates };
}

export interface LearningCourse {
  enrollmentId: string;
  courseId: string;
  title: string;
  slug: string;
  thumbnailUrl: string | null;
  categoryName: string | null;
  level: string;
  totalLessons: number;
  completedLessons: number;
  progressPercent: number;
  hasCertificate: boolean;
  status: string;
}

export async function getMyLearning(userId: string): Promise<LearningCourse[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, status: { in: ["ACTIVE", "COMPLETED"] } },
    orderBy: { updatedAt: "desc" },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          slug: true,
          thumbnailUrl: true,
          level: true,
          category: { select: { name: true } },
        },
      },
      certificate: { select: { id: true } },
    },
  });
  if (enrollments.length === 0) return [];

  const courseIds = enrollments.map((e) => e.courseId);

  // Total lessons per course (one query) and completed lessons for the user.
  const [allLessons, done] = await Promise.all([
    prisma.lesson.findMany({
      where: { chapter: { courseId: { in: courseIds } } },
      select: { chapter: { select: { courseId: true } } },
    }),
    prisma.lessonProgress.findMany({
      where: { userId, completed: true, lesson: { chapter: { courseId: { in: courseIds } } } },
      select: { lesson: { select: { chapter: { select: { courseId: true } } } } },
    }),
  ]);

  const totals = new Map<string, number>();
  for (const l of allLessons) totals.set(l.chapter.courseId, (totals.get(l.chapter.courseId) ?? 0) + 1);
  const completedMap = new Map<string, number>();
  for (const d of done) {
    const cid = d.lesson.chapter.courseId;
    completedMap.set(cid, (completedMap.get(cid) ?? 0) + 1);
  }

  return enrollments.map((e) => {
    const total = totals.get(e.courseId) ?? 0;
    const completed = completedMap.get(e.courseId) ?? 0;
    return {
      enrollmentId: e.id,
      courseId: e.courseId,
      title: e.course.title,
      slug: e.course.slug,
      thumbnailUrl: e.course.thumbnailUrl,
      categoryName: e.course.category?.name ?? null,
      level: e.course.level,
      totalLessons: total,
      completedLessons: completed,
      progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
      hasCertificate: Boolean(e.certificate),
      status: e.status,
    };
  });
}

/** The set of course ids the user is enrolled in (any status) — for catalog badges. */
export async function getEnrolledCourseIds(userId: string): Promise<string[]> {
  const rows = await prisma.enrollment.findMany({
    where: { userId },
    select: { courseId: true },
  });
  return rows.map((r) => r.courseId);
}
