import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

const DAY_MS = 86_400_000;

export const ANALYTICS_RANGES = [7, 30, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export function normalizeRange(value: unknown): AnalyticsRange {
  const n = Number(value);
  return (ANALYTICS_RANGES as readonly number[]).includes(n) ? (n as AnalyticsRange) : 30;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
// UTC midnight — must match dayKey (which keys off toISOString/UTC) so that
// records bucket into an existing day regardless of the server's timezone.
function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}

// ── KPIs (current window vs the preceding window of equal length) ─────────────

export interface Kpi {
  value: number;
  prev: number;
  delta: number; // percent change vs previous window
}
export interface AnalyticsKpis {
  revenue: Kpi;
  enrollments: Kpi;
  signups: Kpi;
  completions: Kpi;
  publishedCourses: number;
  avgRating: number;
  activeLearners: number;
}

export async function getAnalyticsKpis(days: number): Promise<AnalyticsKpis> {
  const now = new Date();
  const currStart = new Date(now.getTime() - days * DAY_MS);
  const prevStart = new Date(now.getTime() - 2 * days * DAY_MS);

  const paidRevenue = (gte: Date, lt: Date) =>
    prisma.payment
      .aggregate({ _sum: { netAmount: true }, where: { status: "PAID", paidAt: { gte, lt } } })
      .then((r) => r._sum.netAmount?.toNumber() ?? 0);

  const [
    revCurr,
    revPrev,
    enrCurr,
    enrPrev,
    userCurr,
    userPrev,
    compCurr,
    compPrev,
    publishedCourses,
    ratingAgg,
    activeLearners,
  ] = await Promise.all([
    paidRevenue(currStart, now),
    paidRevenue(prevStart, currStart),
    prisma.enrollment.count({ where: { createdAt: { gte: currStart, lt: now } } }),
    prisma.enrollment.count({ where: { createdAt: { gte: prevStart, lt: currStart } } }),
    prisma.user.count({ where: { createdAt: { gte: currStart, lt: now } } }),
    prisma.user.count({ where: { createdAt: { gte: prevStart, lt: currStart } } }),
    prisma.enrollment.count({
      where: { status: "COMPLETED", completedAt: { gte: currStart, lt: now } },
    }),
    prisma.enrollment.count({
      where: { status: "COMPLETED", completedAt: { gte: prevStart, lt: currStart } },
    }),
    prisma.course.count({ where: { status: "PUBLISHED" } }),
    prisma.course.aggregate({ _avg: { ratingAvg: true }, where: { ratingCount: { gt: 0 } } }),
    prisma.enrollment.findMany({ distinct: ["userId"], select: { userId: true } }),
  ]);

  return {
    revenue: { value: revCurr, prev: revPrev, delta: pctChange(revCurr, revPrev) },
    enrollments: { value: enrCurr, prev: enrPrev, delta: pctChange(enrCurr, enrPrev) },
    signups: { value: userCurr, prev: userPrev, delta: pctChange(userCurr, userPrev) },
    completions: { value: compCurr, prev: compPrev, delta: pctChange(compCurr, compPrev) },
    publishedCourses,
    avgRating: Number((ratingAgg._avg.ratingAvg ?? 0).toFixed(2)),
    activeLearners: activeLearners.length,
  };
}

// ── Trend series (daily buckets over the window) ─────────────────────────────

export interface TrendPoint {
  date: string;
  label: string;
  revenue: number;
  enrollments: number;
  signups: number;
}

export async function getTrendSeries(days: number): Promise<TrendPoint[]> {
  const start = startOfTodayUtc();
  start.setTime(start.getTime() - (days - 1) * DAY_MS);

  const [payments, enrollments, users] = await Promise.all([
    prisma.payment.findMany({
      where: { status: "PAID", paidAt: { gte: start } },
      select: { netAmount: true, paidAt: true },
    }),
    prisma.enrollment.findMany({
      where: { createdAt: { gte: start } },
      select: { createdAt: true },
    }),
    prisma.user.findMany({
      where: { createdAt: { gte: start } },
      select: { createdAt: true },
    }),
  ]);

  const rev = new Map<string, number>();
  const enr = new Map<string, number>();
  const sig = new Map<string, number>();
  for (const p of payments) {
    if (!p.paidAt) continue;
    const k = dayKey(p.paidAt);
    rev.set(k, (rev.get(k) ?? 0) + p.netAmount.toNumber());
  }
  for (const e of enrollments) enr.set(dayKey(e.createdAt), (enr.get(dayKey(e.createdAt)) ?? 0) + 1);
  for (const u of users) sig.set(dayKey(u.createdAt), (sig.get(dayKey(u.createdAt)) ?? 0) + 1);

  const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start.getTime() + i * DAY_MS);
    const k = dayKey(d);
    return {
      date: k,
      label: fmt.format(d),
      revenue: rev.get(k) ?? 0,
      enrollments: enr.get(k) ?? 0,
      signups: sig.get(k) ?? 0,
    };
  });
}

// ── Breakdowns ───────────────────────────────────────────────────────────────

export interface Slice {
  name: string;
  value: number;
}

const ENROLLMENT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  REFUNDED: "Refunded",
};

export async function getEnrollmentStatusBreakdown(): Promise<Slice[]> {
  const rows = await prisma.enrollment.groupBy({ by: ["status"], _count: { _all: true } });
  return rows
    .map((r) => ({ name: ENROLLMENT_STATUS_LABEL[r.status] ?? r.status, value: r._count._all }))
    .sort((a, b) => b.value - a.value);
}

export async function getUsersByRole(): Promise<Slice[]> {
  const [grouped, roles] = await Promise.all([
    prisma.user.groupBy({ by: ["roleId"], _count: { _all: true } }),
    prisma.role.findMany({ select: { id: true, name: true } }),
  ]);
  const nameById = new Map(roles.map((r) => [r.id, r.name]));
  return grouped
    .map((g) => ({ name: nameById.get(g.roleId) ?? "Unknown", value: g._count._all }))
    .sort((a, b) => b.value - a.value);
}

export async function getRevenueByCategory(limit = 6): Promise<Slice[]> {
  const payments = await prisma.payment.findMany({
    where: { status: "PAID", courseId: { not: null } },
    select: { netAmount: true, course: { select: { category: { select: { name: true } } } } },
  });
  const byCat = new Map<string, number>();
  for (const p of payments) {
    const name = p.course?.category?.name ?? "Uncategorised";
    byCat.set(name, (byCat.get(name) ?? 0) + p.netAmount.toNumber());
  }
  return Array.from(byCat, ([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export interface TopCourse {
  id: string;
  title: string;
  categoryName: string | null;
  enrollments: number;
  revenue: number;
}

export async function getTopCourses(limit = 6): Promise<TopCourse[]> {
  const [courses, revenueByCourse] = await Promise.all([
    prisma.course.findMany({
      orderBy: { enrollmentCount: "desc" },
      take: limit,
      select: {
        id: true,
        title: true,
        enrollmentCount: true,
        category: { select: { name: true } },
        _count: { select: { enrollments: true } },
      },
    }),
    prisma.payment.groupBy({
      by: ["courseId"],
      where: { status: "PAID", courseId: { not: null } },
      _sum: { netAmount: true },
    }),
  ]);

  const revById = new Map<string, number>();
  for (const r of revenueByCourse) {
    if (r.courseId) revById.set(r.courseId, r._sum.netAmount?.toNumber() ?? 0);
  }

  return courses.map((c) => ({
    id: c.id,
    title: c.title,
    categoryName: c.category?.name ?? null,
    enrollments: c._count.enrollments || c.enrollmentCount,
    revenue: revById.get(c.id) ?? 0,
  }));
}

// ── Performance analytics (student / batch / instructor) ─────────────────────

function pct(num: number, den: number): number {
  return den > 0 ? Math.round((num / den) * 100) : 0;
}
function avg(nums: number[]): number {
  return nums.length ? Math.round(nums.reduce((s, n) => s + n, 0) / nums.length) : 0;
}

export interface StudentPerfRow {
  id: string;
  name: string;
  avatarUrl: string | null;
  courses: number;
  avgProgress: number;
  completions: number;
  certificates: number;
  quizAvg: number | null;
  assignmentAvg: number | null;
}

/** Per-student performance. Scope to one instructor's courses when given. */
export async function getStudentPerformance(instructorId?: string): Promise<StudentPerfRow[]> {
  const scope: Prisma.EnrollmentWhereInput = instructorId ? { course: { instructorId } } : {};
  const enrollments = await prisma.enrollment.findMany({
    where: scope,
    select: {
      userId: true,
      progressPercent: true,
      status: true,
      user: { select: { name: true, avatarUrl: true } },
      certificate: { select: { id: true } },
    },
  });

  type Acc = {
    name: string;
    avatarUrl: string | null;
    progress: number[];
    completions: number;
    certificates: number;
  };
  const byStudent = new Map<string, Acc>();
  for (const e of enrollments) {
    const a = byStudent.get(e.userId) ?? {
      name: e.user.name,
      avatarUrl: e.user.avatarUrl,
      progress: [],
      completions: 0,
      certificates: 0,
    };
    a.progress.push(e.progressPercent);
    if (e.status === "COMPLETED") a.completions += 1;
    if (e.certificate) a.certificates += 1;
    byStudent.set(e.userId, a);
  }

  const studentIds = [...byStudent.keys()];
  if (studentIds.length === 0) return [];

  const [attempts, subs] = await Promise.all([
    prisma.quizAttempt.findMany({
      where: {
        studentId: { in: studentIds },
        status: { in: ["SUBMITTED", "GRADED"] },
        maxScore: { gt: 0 },
        ...(instructorId ? { quiz: { course: { instructorId } } } : {}),
      },
      select: { studentId: true, score: true, maxScore: true },
    }),
    prisma.assignmentSubmission.findMany({
      where: {
        studentId: { in: studentIds },
        status: "GRADED",
        score: { not: null },
        ...(instructorId ? { assignment: { course: { instructorId } } } : {}),
      },
      select: { studentId: true, score: true, assignment: { select: { maxScore: true } } },
    }),
  ]);

  const quizPct = new Map<string, number[]>();
  for (const q of attempts) {
    const p = pct(q.score ?? 0, q.maxScore);
    quizPct.set(q.studentId, [...(quizPct.get(q.studentId) ?? []), p]);
  }
  const asgPct = new Map<string, number[]>();
  for (const s of subs) {
    const p = pct(s.score ?? 0, s.assignment.maxScore || 100);
    asgPct.set(s.studentId, [...(asgPct.get(s.studentId) ?? []), p]);
  }

  return [...byStudent.entries()]
    .map(([id, a]) => ({
      id,
      name: a.name,
      avatarUrl: a.avatarUrl,
      courses: a.progress.length,
      avgProgress: avg(a.progress),
      completions: a.completions,
      certificates: a.certificates,
      quizAvg: quizPct.has(id) ? avg(quizPct.get(id)!) : null,
      assignmentAvg: asgPct.has(id) ? avg(asgPct.get(id)!) : null,
    }))
    .sort((x, y) => y.avgProgress - x.avgProgress);
}

export interface BatchPerfRow {
  id: string;
  name: string;
  courseTitle: string | null;
  instructorName: string | null;
  status: string;
  learners: number;
  avgProgress: number;
  completions: number;
}

export async function getBatchPerformance(instructorId?: string): Promise<BatchPerfRow[]> {
  const batches = await prisma.batch.findMany({
    where: instructorId ? { instructorId } : {},
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      enrolledCount: true,
      course: { select: { title: true } },
      instructor: { select: { name: true } },
    },
  });
  const ids = batches.map((b) => b.id);
  if (ids.length === 0) return [];

  const [agg, completed] = await Promise.all([
    prisma.enrollment.groupBy({
      by: ["batchId"],
      where: { batchId: { in: ids } },
      _avg: { progressPercent: true },
      _count: { _all: true },
    }),
    prisma.enrollment.groupBy({
      by: ["batchId"],
      where: { batchId: { in: ids }, status: "COMPLETED" },
      _count: { _all: true },
    }),
  ]);
  const aggMap = new Map(agg.map((a) => [a.batchId, a]));
  const compMap = new Map(completed.map((c) => [c.batchId, c._count._all]));

  return batches.map((b) => {
    const a = aggMap.get(b.id);
    return {
      id: b.id,
      name: b.name,
      courseTitle: b.course?.title ?? null,
      instructorName: b.instructor?.name ?? null,
      status: b.status,
      learners: a?._count._all ?? b.enrolledCount,
      avgProgress: Math.round(a?._avg.progressPercent ?? 0),
      completions: compMap.get(b.id) ?? 0,
    };
  });
}

export interface InstructorPerfRow {
  id: string;
  name: string;
  avatarUrl: string | null;
  courses: number;
  students: number;
  avgRating: number;
  revenue: number;
  completions: number;
}

export async function getInstructorPerformance(): Promise<InstructorPerfRow[]> {
  const [courses, enrollments, payments] = await Promise.all([
    prisma.course.findMany({
      select: {
        instructorId: true,
        ratingAvg: true,
        ratingCount: true,
        instructor: { select: { name: true, avatarUrl: true } },
      },
    }),
    prisma.enrollment.findMany({
      select: { userId: true, status: true, course: { select: { instructorId: true } } },
    }),
    prisma.payment.findMany({
      where: { status: "PAID", courseId: { not: null } },
      select: { netAmount: true, course: { select: { instructorId: true } } },
    }),
  ]);

  type Acc = {
    name: string;
    avatarUrl: string | null;
    courses: number;
    ratingSum: number;
    ratingWeight: number;
    students: Set<string>;
    completions: number;
    revenue: number;
  };
  const map = new Map<string, Acc>();
  const get = (id: string, name: string, avatarUrl: string | null): Acc => {
    const a = map.get(id) ?? {
      name,
      avatarUrl,
      courses: 0,
      ratingSum: 0,
      ratingWeight: 0,
      students: new Set<string>(),
      completions: 0,
      revenue: 0,
    };
    map.set(id, a);
    return a;
  };

  for (const c of courses) {
    const a = get(c.instructorId, c.instructor.name, c.instructor.avatarUrl);
    a.courses += 1;
    if (c.ratingCount > 0) {
      a.ratingSum += c.ratingAvg * c.ratingCount;
      a.ratingWeight += c.ratingCount;
    }
  }
  for (const e of enrollments) {
    const iid = e.course?.instructorId;
    if (!iid || !map.has(iid)) continue;
    const a = map.get(iid)!;
    a.students.add(e.userId);
    if (e.status === "COMPLETED") a.completions += 1;
  }
  for (const p of payments) {
    const iid = p.course?.instructorId;
    if (!iid || !map.has(iid)) continue;
    map.get(iid)!.revenue += p.netAmount.toNumber();
  }

  return [...map.entries()]
    .map(([id, a]) => ({
      id,
      name: a.name,
      avatarUrl: a.avatarUrl,
      courses: a.courses,
      students: a.students.size,
      avgRating: a.ratingWeight > 0 ? Math.round((a.ratingSum / a.ratingWeight) * 10) / 10 : 0,
      revenue: a.revenue,
      completions: a.completions,
    }))
    .sort((x, y) => y.revenue - x.revenue);
}
