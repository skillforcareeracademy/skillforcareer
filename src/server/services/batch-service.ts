import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { ROLES } from "@/config/roles";
import { queueAddedToBatch } from "./batch-emails";
import {
  bumpBatchEnrolledCount,
  bumpCourseEnrollmentCount,
  moveEnrollmentsToBatch,
  unlinkEnrollmentFromBatch,
} from "@/server/repositories/counters";
import { activeStudentWhere } from "@/server/repositories/role-filters";
import type { BatchInput, BatchSchedule } from "@/lib/validations/batch";

/**
 * Batches an instructor teaches: the ones they lead, plus the ones they are an
 * associate instructor on. Used wherever an instructor sees "my batches".
 */
export function instructorBatchScope(userId: string): Prisma.BatchWhereInput {
  return { OR: [{ instructorId: userId }, { associates: { some: { userId } } }] };
}

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
  /** Scope to batches one instructor leads or assists on. */
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
  if (q.instructorId) and.push(instructorBatchScope(q.instructorId));
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
        associates: {
          orderBy: { createdAt: "asc" },
          select: { user: { select: { id: true, name: true } } },
        },
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
      associates: b.associates.map((a) => ({ id: a.user.id, name: a.user.name })),
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
      associates: {
        orderBy: { createdAt: "asc" },
        select: { user: { select: { id: true, name: true, avatarUrl: true } } },
      },
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
    instructorId: b.instructorId,
    instructor: b.instructor,
    associates: b.associates.map((a) => ({
      id: a.user.id,
      name: a.user.name,
      avatarUrl: a.user.avatarUrl,
    })),
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
  const scope: Prisma.BatchWhereInput = instructorId ? instructorBatchScope(instructorId) : {};
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

/** Staff/instructors who can lead a batch — including a student who also teaches. */
export async function listInstructors() {
  return prisma.user.findMany({
    where: {
      OR: [
        { role: { slug: { in: [ROLES.INSTRUCTOR, ROLES.ADMIN, ROLES.SUPER_ADMIN] } } },
        { extraRoles: { some: { role: { slug: ROLES.INSTRUCTOR } } } },
      ],
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

/**
 * Students to offer in the batch's "add learner" picker.
 *
 * "Batch me student add krne wali list me instructor and admin kyu dikh rhe
 * hain" — only people who are students (by their main role or an extra one)
 * and whose account is active belong here. Staff accounts, pending sign-ups
 * and suspended learners are left out.
 */
export async function listStudentsForBatchSelect(search?: string): Promise<BatchStudent[]> {
  const rows = await prisma.user.findMany({
    where: {
      AND: [
        activeStudentWhere(),
        ...(search
          ? [{ OR: [{ name: { contains: search } }, { email: { contains: search } }] }]
          : []),
      ],
    },
    select: { id: true, name: true, email: true, avatarUrl: true },
    orderBy: { name: "asc" },
    take: 50,
  });
  return rows.map((u) => ({ userId: u.id, name: u.name, email: u.email, avatar: u.avatarUrl }));
}

/** What happened to each learner handed to `placeStudentsOnBatch`. */
export interface BatchPlacement {
  /** New to the course — enrolled straight onto this batch. */
  enrolled: string[];
  /** Owned the course without a batch — this batch was attached. */
  attached: string[];
  /** Sat on another batch of the course — moved here. */
  moved: { userId: string; fromBatchId: string; fromBatchName: string }[];
  /** Already on this batch; nothing to do. */
  already: string[];
  /** Turned away because the batch had no seats left (only when enforced). */
  full: string[];
}

/**
 * Put learners onto a batch — the one routine behind both the hand-picked add
 * and the CSV import, so both keep the counters straight and both send the
 * "you've been added" email.
 *
 * A learner who already owns the course keeps their enrolment and is attached
 * to (or moved onto) this batch; a brand-new one gets an ADMIN_GRANT enrolment
 * and bumps the course's total. With `enforceCapacity`, learners past the
 * batch's last free seat come back in `full`, in the order given.
 *
 * `enrolledCount` is nudged by the real delta rather than recomputed, so a
 * batch's advertised head-count only ever moves by genuine admin actions — and
 * a learner moved off another batch now comes off that batch's count too.
 */
export async function placeStudentsOnBatch(
  batchId: string,
  userIds: string[],
  opts: { enforceCapacity?: boolean } = {},
): Promise<BatchPlacement> {
  const ids = [...new Set(userIds)].filter(Boolean);
  const placement: BatchPlacement = { enrolled: [], attached: [], moved: [], already: [], full: [] };

  const [batch, seated, existing] = await Promise.all([
    prisma.batch.findUnique({
      where: { id: batchId },
      select: { id: true, courseId: true, capacity: true },
    }),
    opts.enforceCapacity ? prisma.enrollment.count({ where: { batchId } }) : Promise.resolve(0),
    ids.length
      ? prisma.enrollment.findMany({
          where: { userId: { in: ids }, course: { batches: { some: { id: batchId } } } },
          select: { id: true, userId: true, batchId: true, batch: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);
  if (!batch) throw AppError.notFound("Batch not found.");
  if (ids.length === 0) return placement;

  const byUser = new Map(existing.map((e) => [e.userId, e]));
  let seatsLeft =
    opts.enforceCapacity && batch.capacity != null ? Math.max(0, batch.capacity - seated) : Infinity;

  const relinkIds: string[] = [];
  /** How many learners each other batch is losing to this one. */
  const leaving = new Map<string, number>();

  for (const userId of ids) {
    const e = byUser.get(userId);
    if (e?.batchId === batchId) {
      placement.already.push(userId);
      continue;
    }
    if (seatsLeft <= 0) {
      placement.full.push(userId);
      continue;
    }
    seatsLeft -= 1;
    if (!e) {
      placement.enrolled.push(userId);
    } else if (!e.batchId) {
      placement.attached.push(userId);
      relinkIds.push(e.id);
    } else {
      placement.moved.push({ userId, fromBatchId: e.batchId, fromBatchName: e.batch?.name ?? "" });
      relinkIds.push(e.id);
      leaving.set(e.batchId, (leaving.get(e.batchId) ?? 0) + 1);
    }
  }

  const addedIds = [
    ...placement.enrolled,
    ...placement.attached,
    ...placement.moved.map((m) => m.userId),
  ];
  if (addedIds.length === 0) return placement;

  // A handful of statements, whatever the roster size. Per-row `create`/
  // `update` calls fan out into a relation-integrity SELECT each under
  // relationMode="prisma", which overran the 5 s transaction timeout as soon as
  // two learners were picked at once — see src/server/repositories/counters.ts.
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (placement.enrolled.length > 0) {
    ops.push(
      prisma.enrollment.createMany({
        data: placement.enrolled.map((userId) => ({
          userId,
          courseId: batch.courseId,
          batchId,
          status: "ACTIVE" as const,
          source: "ADMIN_GRANT" as const,
        })),
      }),
    );
    ops.push(bumpCourseEnrollmentCount(batch.courseId, placement.enrolled.length));
  }
  if (relinkIds.length > 0) ops.push(moveEnrollmentsToBatch(relinkIds, batchId));
  ops.push(bumpBatchEnrolledCount(batchId, addedIds.length));
  for (const [fromId, n] of leaving) ops.push(bumpBatchEnrolledCount(fromId, -n));

  await prisma.$transaction(ops);

  // Email + bell for everyone who is newly on this batch, sent after the
  // response so the admin isn't kept waiting on SMTP.
  queueAddedToBatch(batchId, addedIds);

  return placement;
}

/**
 * Put hand-picked learners onto a batch (walk-ins, offline sign-ups). Capacity
 * is advisory here — the picker warns before going over, and an admin adding
 * someone by hand means it. Returns how many were actually added or moved.
 */
export async function addBatchStudents(batchId: string, userIds: string[]): Promise<number> {
  // The picker only offers active students; hold the endpoint to the same rule
  // so a staff account can't be put on a roster by a hand-made request.
  const students = await prisma.user.findMany({
    where: { AND: [{ id: { in: [...new Set(userIds)] } }, activeStudentWhere()] },
    select: { id: true },
  });
  const allowed = new Set(students.map((s) => s.id));
  const p = await placeStudentsOnBatch(
    batchId,
    userIds.filter((id) => allowed.has(id)),
  );
  return p.enrolled.length + p.attached.length + p.moved.length;
}

/**
 * Take a learner off a batch. Their enrolment (and course access) stays put —
 * they're just unlinked from the cohort, mirroring an online buyer with no batch.
 */
export async function removeBatchStudent(batchId: string, userId: string): Promise<void> {
  const count = await unlinkEnrollmentFromBatch(batchId, userId);
  if (count === 0) return;

  await bumpBatchEnrolledCount(batchId, -count);
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
    include: {
      course: { select: { title: true } },
      instructor: { select: { name: true } },
      associates: { select: { user: { select: { name: true } } } },
    },
  });
  const headers = [
    "Name",
    "Code",
    "Course",
    "Instructor",
    "Associate instructors",
    "Status",
    "Learners",
    "Capacity",
    "Starts",
    "Ends",
  ];
  const data = rows.map((b) => [
    b.name,
    b.code,
    b.course?.title ?? "",
    b.instructor?.name ?? "",
    b.associates.map((a) => a.user.name).join(", "),
    b.status,
    b.enrolledCount,
    b.capacity ?? "",
    b.startDate ? b.startDate.toISOString().slice(0, 10) : "",
    b.endDate ? b.endDate.toISOString().slice(0, 10) : "",
  ]);
  return { headers, data };
}
