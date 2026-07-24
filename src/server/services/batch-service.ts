import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { ROLES } from "@/config/roles";
import { notify } from "./notification-service";
import type { BatchInput, BatchSchedule } from "@/lib/validations/batch";

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDate(value?: string): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function normalizeSchedule(s?: BatchSchedule): Prisma.InputJsonValue | undefined {
  if (!s) return undefined;
  const days = s.days ?? [];
  if (days.length === 0 && !s.startTime && !s.endTime) return undefined;
  return { days, startTime: s.startTime ?? "", endTime: s.endTime ?? "" };
}

function parseSchedule(json: Prisma.JsonValue | null): BatchSchedule | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const days = Array.isArray(o.days) ? (o.days.filter((d) => typeof d === "string") as string[]) : [];
  return {
    days: days as BatchSchedule["days"],
    startTime: typeof o.startTime === "string" ? o.startTime : "",
    endTime: typeof o.endTime === "string" ? o.endTime : "",
  };
}

async function uniqueCode(base: string, excludeId?: string): Promise<string> {
  const root =
    base
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "BATCH";
  let code = root;
  for (let n = 2; ; n += 1) {
    const clash = await prisma.batch.findUnique({ where: { code }, select: { id: true } });
    if (!clash || clash.id === excludeId) return code;
    code = `${root}-${n}`;
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

export interface BatchListQuery {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  courseId?: string;
  /** Scope to batches led by one instructor. */
  instructorId?: string;
}

export async function listBatchesAdmin(q: BatchListQuery) {
  const and: Prisma.BatchWhereInput[] = [];
  if (q.search) {
    and.push({
      OR: [{ name: { contains: q.search } }, { code: { contains: q.search } }],
    });
  }
  if (q.status) and.push({ status: q.status as Prisma.BatchWhereInput["status"] });
  if (q.courseId) and.push({ courseId: q.courseId });
  if (q.instructorId) and.push({ instructorId: q.instructorId });
  const where: Prisma.BatchWhereInput = and.length ? { AND: and } : {};

  const [total, rows] = await Promise.all([
    prisma.batch.count({ where }),
    prisma.batch.findMany({
      where,
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        course: { select: { title: true } },
        instructor: { select: { name: true } },
        _count: { select: { enrollments: true } },
      },
    }),
  ]);

  return {
    total,
    batches: rows.map((b) => ({
      id: b.id,
      name: b.name,
      code: b.code,
      status: b.status,
      courseId: b.courseId,
      courseTitle: b.course.title,
      instructorId: b.instructorId,
      instructorName: b.instructor?.name ?? null,
      capacity: b.capacity,
      enrolledCount: b.enrolledCount || b._count.enrollments,
      startDate: b.startDate ? b.startDate.toISOString() : null,
      endDate: b.endDate ? b.endDate.toISOString() : null,
      schedule: parseSchedule(b.schedule),
    })),
  };
}

/**
 * Cohorts the public "Live classes" page advertises: running or about to start,
 * on a course that is actually published. Sorted by the soonest start.
 */
export async function listUpcomingLiveBatches(take = 9) {
  const rows = await prisma.batch.findMany({
    where: {
      status: { in: ["UPCOMING", "ONGOING"] },
      course: { status: "PUBLISHED" },
    },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    take,
    select: {
      id: true,
      name: true,
      status: true,
      capacity: true,
      enrolledCount: true,
      startDate: true,
      schedule: true,
      course: { select: { title: true, slug: true, thumbnailUrl: true, level: true } },
      instructor: { select: { name: true } },
    },
  });

  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    status: b.status,
    capacity: b.capacity,
    enrolledCount: b.enrolledCount,
    seatsLeft: b.capacity ? Math.max(0, b.capacity - b.enrolledCount) : null,
    startDate: b.startDate ? b.startDate.toISOString() : null,
    schedule: parseSchedule(b.schedule),
    courseTitle: b.course.title,
    courseSlug: b.course.slug,
    courseThumbnailUrl: b.course.thumbnailUrl,
    courseLevel: b.course.level,
    instructorName: b.instructor?.name ?? null,
  }));
}

/** Full batch detail incl. the enrolled-learner roster. */
export async function getBatchDetail(id: string) {
  const b = await prisma.batch.findUnique({
    where: { id },
    include: {
      course: { select: { title: true, slug: true } },
      instructor: { select: { name: true, avatarUrl: true, headline: true } },
      enrollments: {
        take: 200,
        orderBy: { enrolledAt: "desc" },
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
      },
      _count: { select: { enrollments: true } },
    },
  });
  if (!b) throw AppError.notFound("Batch not found.");

  return {
    id: b.id,
    name: b.name,
    code: b.code,
    status: b.status,
    capacity: b.capacity,
    enrolledCount: b.enrolledCount || b._count.enrollments,
    startDate: b.startDate ? b.startDate.toISOString() : null,
    endDate: b.endDate ? b.endDate.toISOString() : null,
    schedule: parseSchedule(b.schedule),
    course: b.course,
    instructor: b.instructor,
    students: b.enrollments.map((e) => ({
      id: e.user.id,
      name: e.user.name,
      email: e.user.email,
      avatarUrl: e.user.avatarUrl,
      status: e.status,
      progress: e.progressPercent,
      enrolledAt: e.enrolledAt.toISOString(),
    })),
  };
}

export interface BatchStats {
  total: number;
  upcoming: number;
  ongoing: number;
  completed: number;
  learners: number;
}

export async function batchStats(instructorId?: string): Promise<BatchStats> {
  const scope: Prisma.BatchWhereInput = instructorId ? { instructorId } : {};
  const [total, upcoming, ongoing, completed, agg] = await Promise.all([
    prisma.batch.count({ where: scope }),
    prisma.batch.count({ where: { ...scope, status: "UPCOMING" } }),
    prisma.batch.count({ where: { ...scope, status: "ONGOING" } }),
    prisma.batch.count({ where: { ...scope, status: "COMPLETED" } }),
    prisma.batch.aggregate({ _sum: { enrolledCount: true }, where: scope }),
  ]);
  return { total, upcoming, ongoing, completed, learners: agg._sum.enrolledCount ?? 0 };
}

/** Courses to choose from when creating a batch. */
export async function listCoursesForBatch(instructorId?: string) {
  return prisma.course.findMany({
    where: instructorId ? { instructorId } : {},
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
}

/** Staff/instructors who can lead a batch. */
export async function listInstructors() {
  return prisma.user.findMany({
    where: {
      role: { slug: { in: [ROLES.INSTRUCTOR, ROLES.ADMIN, ROLES.SUPER_ADMIN] } },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

// ── Writes ───────────────────────────────────────────────────────────────────

export async function createBatch(input: BatchInput): Promise<string> {
  const course = await prisma.course.findUnique({
    where: { id: input.courseId },
    select: { id: true },
  });
  if (!course) throw AppError.badRequest("Selected course no longer exists.");

  const code = await uniqueCode(input.code || input.name);
  const batch = await prisma.batch.create({
    data: {
      name: input.name,
      code,
      courseId: input.courseId,
      instructorId: input.instructorId || null,
      status: input.status,
      capacity: input.capacity ?? null,
      startDate: toDate(input.startDate),
      endDate: toDate(input.endDate),
      schedule: normalizeSchedule(input.schedule),
    },
    select: { id: true },
  });
  return batch.id;
}

export async function updateBatch(id: string, input: BatchInput): Promise<void> {
  const existing = await prisma.batch.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Batch not found.");

  const code = await uniqueCode(input.code || input.name, id);
  await prisma.batch.update({
    where: { id },
    data: {
      name: input.name,
      code,
      courseId: input.courseId,
      instructorId: input.instructorId || null,
      status: input.status,
      capacity: input.capacity ?? null,
      startDate: toDate(input.startDate),
      endDate: toDate(input.endDate),
      schedule: normalizeSchedule(input.schedule) ?? Prisma.JsonNull,
    },
  });
}

export async function deleteBatch(id: string): Promise<void> {
  const batch = await prisma.batch.findUnique({
    where: { id },
    select: { _count: { select: { enrollments: true } } },
  });
  if (!batch) throw AppError.notFound("Batch not found.");
  if (batch._count.enrollments > 0) {
    throw AppError.badRequest("This batch has learners enrolled and can't be deleted.");
  }
  await prisma.batch.delete({ where: { id } });
}

// ── Roster (hand-added learners) ───────────────────────────────────────────────
// The join code lets learners enrol themselves, but plenty walk in offline. These
// let an admin put a student straight onto a batch's course.

export interface BatchStudent {
  userId: string;
  name: string;
  email: string;
  avatar: string | null;
}

/** Learners currently on a batch (i.e. enrolled in its course under this batch). */
export async function listBatchStudents(batchId: string): Promise<BatchStudent[]> {
  const rows = await prisma.enrollment.findMany({
    where: { batchId },
    select: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return rows.map((r) => ({
    userId: r.user.id,
    name: r.user.name,
    email: r.user.email,
    avatar: r.user.avatarUrl,
  }));
}

/** Students to offer in the batch's "add learner" picker. */
export async function listStudentsForBatchSelect(search?: string): Promise<BatchStudent[]> {
  const rows = await prisma.user.findMany({
    where: {
      role: { slug: ROLES.STUDENT },
      ...(search
        ? { OR: [{ name: { contains: search } }, { email: { contains: search } }] }
        : {}),
    },
    select: { id: true, name: true, email: true, avatarUrl: true },
    orderBy: { name: "asc" },
    take: 50,
  });
  return rows.map((u) => ({ userId: u.id, name: u.name, email: u.email, avatar: u.avatarUrl }));
}

/**
 * Put learners onto a batch. A student who already owns the course is simply
 * moved onto this batch; a brand-new learner gets an ADMIN_GRANT enrolment (and
 * bumps the course's total). Re-adding someone already here is a no-op. Returns
 * how many were actually added or moved.
 *
 * `enrolledCount` is nudged by the real delta rather than recomputed, so a
 * batch's advertised head-count only ever moves by genuine admin actions.
 */
export async function addBatchStudents(batchId: string, userIds: string[]): Promise<number> {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { id: true, name: true, courseId: true, course: { select: { title: true, slug: true } } },
  });
  if (!batch) throw AppError.notFound("Batch not found.");

  const ids = [...new Set(userIds)];
  if (ids.length === 0) return 0;

  const existing = await prisma.enrollment.findMany({
    where: { courseId: batch.courseId, userId: { in: ids } },
    select: { id: true, userId: true, batchId: true },
  });
  const byUser = new Map(existing.map((e) => [e.userId, e]));

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  const added: string[] = [];
  let newEnrolments = 0;

  for (const userId of ids) {
    const e = byUser.get(userId);
    if (e) {
      if (e.batchId === batchId) continue; // already on this batch
      ops.push(
        prisma.enrollment.update({
          where: { id: e.id },
          data: { batchId, status: "ACTIVE" },
        }),
      );
    } else {
      ops.push(
        prisma.enrollment.create({
          data: { userId, courseId: batch.courseId, batchId, status: "ACTIVE", source: "ADMIN_GRANT" },
        }),
      );
      newEnrolments += 1;
    }
    added.push(userId);
  }

  if (added.length === 0) return 0;

  if (newEnrolments > 0) {
    ops.push(
      prisma.course.update({
        where: { id: batch.courseId },
        data: { enrollmentCount: { increment: newEnrolments } },
      }),
    );
  }
  ops.push(
    prisma.batch.update({
      where: { id: batchId },
      data: { enrolledCount: { increment: added.length } },
    }),
  );

  await prisma.$transaction(ops);

  await notify({
    userIds: added,
    type: "COURSE",
    title: "You've been added to a batch",
    message: `You're now on “${batch.name}” for ${batch.course.title}.`,
    actionUrl: `/student/learn/${batch.course.slug}`,
  });

  return added.length;
}

/**
 * Take a learner off a batch. Their enrolment (and course access) stays put —
 * they're just unlinked from the cohort, mirroring an online buyer with no batch.
 */
export async function removeBatchStudent(batchId: string, userId: string): Promise<void> {
  const { count } = await prisma.enrollment.updateMany({
    where: { batchId, userId },
    data: { batchId: null },
  });
  if (count === 0) return;

  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { enrolledCount: true },
  });
  if (batch) {
    await prisma.batch.update({
      where: { id: batchId },
      data: { enrolledCount: Math.max(0, batch.enrolledCount - count) },
    });
  }
}

/** All batches matching a filter, flattened for CSV export (no pagination). */
export async function batchesForExport(q: Pick<BatchListQuery, "search" | "status" | "courseId">) {
  const and: Prisma.BatchWhereInput[] = [];
  if (q.search) and.push({ OR: [{ name: { contains: q.search } }, { code: { contains: q.search } }] });
  if (q.status) and.push({ status: q.status as Prisma.BatchWhereInput["status"] });
  if (q.courseId) and.push({ courseId: q.courseId });
  const where: Prisma.BatchWhereInput = and.length ? { AND: and } : {};

  const rows = await prisma.batch.findMany({
    where,
    orderBy: { startDate: "desc" },
    take: 10000,
    include: { course: { select: { title: true } }, instructor: { select: { name: true } } },
  });
  const headers = ["Name", "Code", "Course", "Instructor", "Status", "Learners", "Capacity", "Starts", "Ends"];
  const data = rows.map((b) => [
    b.name,
    b.code,
    b.course?.title ?? "",
    b.instructor?.name ?? "",
    b.status,
    b.enrolledCount,
    b.capacity ?? "",
    b.startDate ? b.startDate.toISOString().slice(0, 10) : "",
    b.endDate ? b.endDate.toISOString().slice(0, 10) : "",
  ]);
  return { headers, data };
}
