import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import type { ModerateThreadInput } from "@/lib/validations/discussion";

// ── Reads ────────────────────────────────────────────────────────────────────

export interface DiscussionListQuery {
  page: number;
  pageSize: number;
  search?: string;
  courseId?: string;
  status?: string; // OPEN | RESOLVED | PINNED
  /** Scope to discussions in one instructor's courses. */
  instructorId?: string;
}

export async function listDiscussionsAdmin(q: DiscussionListQuery) {
  const and: Prisma.DiscussionWhereInput[] = [{ parentId: null }];
  if (q.search) {
    and.push({ OR: [{ title: { contains: q.search } }, { body: { contains: q.search } }] });
  }
  if (q.courseId) and.push({ courseId: q.courseId });
  if (q.instructorId) and.push({ course: { instructorId: q.instructorId } });
  if (q.status === "OPEN") and.push({ isResolved: false });
  if (q.status === "RESOLVED") and.push({ isResolved: true });
  if (q.status === "PINNED") and.push({ isPinned: true });
  const where: Prisma.DiscussionWhereInput = { AND: and };

  const [total, rows] = await Promise.all([
    prisma.discussion.count({ where }),
    prisma.discussion.findMany({
      where,
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        user: { select: { name: true, avatarUrl: true } },
        course: { select: { title: true } },
        _count: { select: { replies: true } },
      },
    }),
  ]);

  return {
    total,
    threads: rows.map((d) => ({
      id: d.id,
      title: d.title,
      body: d.body,
      courseId: d.courseId,
      courseTitle: d.course?.title ?? null,
      authorName: d.user.name,
      authorAvatar: d.user.avatarUrl,
      isPinned: d.isPinned,
      isResolved: d.isResolved,
      replies: d._count.replies,
      updatedAt: d.updatedAt.toISOString(),
    })),
  };
}

export interface DiscussionStats {
  threads: number;
  open: number;
  pinned: number;
  replies: number;
}

export async function discussionStats(instructorId?: string): Promise<DiscussionStats> {
  const c: Prisma.DiscussionWhereInput = instructorId ? { course: { instructorId } } : {};
  const [threads, open, pinned, replies] = await Promise.all([
    prisma.discussion.count({ where: { parentId: null, ...c } }),
    prisma.discussion.count({ where: { parentId: null, isResolved: false, ...c } }),
    prisma.discussion.count({ where: { parentId: null, isPinned: true, ...c } }),
    prisma.discussion.count({ where: { parentId: { not: null }, ...c } }),
  ]);
  return { threads, open, pinned, replies };
}

export async function getThreadDetail(id: string) {
  const d = await prisma.discussion.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
      course: { select: { title: true, slug: true } },
      replies: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      },
    },
  });
  if (!d) throw AppError.notFound("Discussion not found.");

  return {
    id: d.id,
    title: d.title,
    body: d.body,
    isPinned: d.isPinned,
    isResolved: d.isResolved,
    createdAt: d.createdAt.toISOString(),
    course: d.course,
    author: d.user,
    replies: d.replies.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      author: r.user,
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

/** Staff can act anywhere; students must be enrolled in the course. */
async function assertAccess(userId: string, courseId: string | null, isStaff: boolean) {
  if (isStaff) return;
  if (!courseId) throw AppError.forbidden("You can't post here.");
  const enrolled = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { id: true },
  });
  if (!enrolled) throw AppError.forbidden("You're not enrolled in this course.");
}

export async function createThread(
  userId: string,
  courseId: string,
  title: string,
  body: string,
  isStaff: boolean,
): Promise<string> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course) throw AppError.badRequest("Course not found.");
  await assertAccess(userId, courseId, isStaff);
  const thread = await prisma.discussion.create({
    data: { userId, courseId, title, body },
    select: { id: true },
  });
  return thread.id;
}

export async function createReply(
  parentId: string,
  userId: string,
  body: string,
  isStaff: boolean,
): Promise<string> {
  const parent = await prisma.discussion.findUnique({
    where: { id: parentId },
    select: { id: true, courseId: true, lessonId: true },
  });
  if (!parent) throw AppError.notFound("Discussion not found.");
  await assertAccess(userId, parent.courseId, isStaff);

  const reply = await prisma.discussion.create({
    data: {
      userId,
      parentId,
      courseId: parent.courseId,
      lessonId: parent.lessonId,
      body,
    },
    select: { id: true },
  });
  // Bump the thread's last-activity time.
  await prisma.discussion.update({ where: { id: parentId }, data: { updatedAt: new Date() } });
  return reply.id;
}

export async function moderateThread(id: string, input: ModerateThreadInput): Promise<void> {
  const existing = await prisma.discussion.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Discussion not found.");
  const data: Prisma.DiscussionUpdateInput = {};
  if (input.isPinned !== undefined) data.isPinned = input.isPinned;
  if (input.isResolved !== undefined) data.isResolved = input.isResolved;
  await prisma.discussion.update({ where: { id }, data });
}

export async function deleteDiscussion(id: string, userId: string, isStaff: boolean): Promise<void> {
  const existing = await prisma.discussion.findUnique({
    where: { id },
    select: { id: true, parentId: true, userId: true },
  });
  if (!existing) throw AppError.notFound("Discussion not found.");
  if (!isStaff && existing.userId !== userId) {
    throw AppError.forbidden("You can only delete your own posts.");
  }
  // A thread's replies reference it via parentId (NoAction) — remove them first.
  if (existing.parentId === null) {
    await prisma.discussion.deleteMany({ where: { parentId: id } });
  }
  await prisma.discussion.delete({ where: { id } });
}

// ── Student reads ────────────────────────────────────────────────────────────

export async function listDiscussionCourses(userId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { course: { select: { id: true, title: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return enrollments.map((e) => ({ id: e.course.id, title: e.course.title }));
}

export interface StudentThreadRow {
  id: string;
  title: string | null;
  body: string;
  courseId: string | null;
  courseTitle: string | null;
  authorName: string;
  authorAvatar: string | null;
  isPinned: boolean;
  isResolved: boolean;
  replies: number;
  updatedAt: string;
}

export async function listStudentDiscussions(
  userId: string,
  courseId?: string,
): Promise<StudentThreadRow[]> {
  const courses = await prisma.enrollment.findMany({
    where: { userId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { courseId: true },
  });
  const courseIds = courses.map((c) => c.courseId);
  if (courseIds.length === 0) return [];

  const and: Prisma.DiscussionWhereInput[] = [
    { parentId: null },
    { courseId: courseId && courseIds.includes(courseId) ? courseId : { in: courseIds } },
  ];

  const rows = await prisma.discussion.findMany({
    where: { AND: and },
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    take: 100,
    include: {
      user: { select: { name: true, avatarUrl: true } },
      course: { select: { title: true } },
      _count: { select: { replies: true } },
    },
  });

  return rows.map((d) => ({
    id: d.id,
    title: d.title,
    body: d.body,
    courseId: d.courseId,
    courseTitle: d.course?.title ?? null,
    authorName: d.user.name,
    authorAvatar: d.user.avatarUrl,
    isPinned: d.isPinned,
    isResolved: d.isResolved,
    replies: d._count.replies,
    updatedAt: d.updatedAt.toISOString(),
  }));
}
