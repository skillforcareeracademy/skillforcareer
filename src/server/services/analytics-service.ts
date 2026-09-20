import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { toCsv } from "@/lib/csv";

const DAY_MS = 86_400_000;

// ── Date windows ─────────────────────────────────────────────────────────────
//
// The academy runs on India time, so every "day" here is an IST calendar day
// (UTC+05:30, no daylight saving) — in the KPI boundaries, the chart buckets and
// the downloadable report alike. Days travel as `YYYY-MM-DD` strings and all
// calendar arithmetic is done on those; only at query time is a day turned into
// the UTC instant of its IST midnight, because the database stores UTC.

const IST_OFFSET_MINUTES = 330;
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60_000;

export const ANALYTICS_RANGES = [7, 30, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];
const DEFAULT_RANGE: AnalyticsRange = 30;
/** Longest window a custom range may cover: two years, counting a leap day. */
export const MAX_RANGE_DAYS = 731;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Today's date in IST, as `YYYY-MM-DD`. */
export function istToday(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** A real calendar date in `YYYY-MM-DD` form (rejects e.g. `2026-02-30`). */
function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === value;
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Days from `from` to `to`, both inclusive. */
function spanDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

/** The UTC instant at which an IST day begins. */
function istStart(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) - IST_OFFSET_MS);
}

/** "1 Sep" */
function shortDay(day: string): string {
  return `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
}

/** "1 Sep 2026" */
export function formatDay(day: string): string {
  return `${shortDay(day)} ${day.slice(0, 4)}`;
}

/** "1 Sep – 20 Sep 2026", "20 Dec 2025 – 3 Jan 2026", or one day on its own. */
export function formatDayRange(from: string, to: string): string {
  if (from === to) return formatDay(from);
  const head = from.slice(0, 4) === to.slice(0, 4) ? shortDay(from) : formatDay(from);
  return `${head} – ${formatDay(to)}`;
}

/**
 * The period being reported on: `from`–`to` inclusive, in IST days, plus the
 * window of the same length immediately before it that the KPIs compare with.
 */
export interface AnalyticsWindow {
  from: string;
  to: string;
  days: number;
  prevFrom: string;
  prevTo: string;
  /** The quick tab this window equals (the last N days up to today), if any. */
  preset: AnalyticsRange | null;
}

function buildWindow(from: string, to: string, today: string): AnalyticsWindow {
  const days = spanDays(from, to);
  const preset = to === today ? (ANALYTICS_RANGES.find((n) => n === days) ?? null) : null;
  return { from, to, days, prevFrom: addDays(from, -days), prevTo: addDays(from, -1), preset };
}

/**
 * Resolve `?from=&to=` (a custom range) or `?range=7|30|90` (a quick tab) into
 * a window. A custom range wins when present. An invalid one falls back to the
 * quick tab / default and reports why, so the page can say so and the report
 * API can refuse. An end date past today is pulled back to today — there is
 * nothing to count yet, and it would skew the previous-period comparison.
 */
export function resolveAnalyticsWindow(
  params: { from?: unknown; to?: unknown; range?: unknown },
  today: string = istToday(),
): { period: AnalyticsWindow; error: string | null } {
  const n = Number(params.range);
  const quick = (ANALYTICS_RANGES as readonly number[]).includes(n) ? n : DEFAULT_RANGE;
  const fallback = buildWindow(addDays(today, -(quick - 1)), today, today);
  const fail = (error: string) => ({ period: fallback, error });

  const hasFrom = params.from != null && params.from !== "";
  const hasTo = params.to != null && params.to !== "";
  if (!hasFrom && !hasTo) return { period: fallback, error: null };
  if (!hasFrom) return fail("Choose a start date for the custom range.");
  if (!isDay(params.from) || (hasTo && !isDay(params.to))) {
    return fail("Dates must be real calendar dates in YYYY-MM-DD form.");
  }

  const from = params.from;
  const to = hasTo && (params.to as string) < today ? (params.to as string) : today;
  if (from > today) return fail("The start date can't be in the future.");
  if (from > to) return fail("The start date must be on or before the end date.");
  if (spanDays(from, to) > MAX_RANGE_DAYS) {
    return fail(`A custom range can cover at most 2 years (${MAX_RANGE_DAYS} days).`);
  }
  return { period: buildWindow(from, to, today), error: null };
}

export interface RangePreset {
  label: string;
  from: string;
  to: string;
}

/** One-click ranges for the custom-range picker (weeks start on Monday). */
export function analyticsPresets(today: string = istToday()): RangePreset[] {
  const year = Number(today.slice(0, 4));
  const yesterday = addDays(today, -1);
  const weekStart = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthEnd = addDays(monthStart, -1);
  return [
    { label: "Today", from: today, to: today },
    { label: "Yesterday", from: yesterday, to: yesterday },
    { label: "This week", from: weekStart, to: today },
    { label: "Last week", from: addDays(weekStart, -7), to: addDays(weekStart, -1) },
    { label: "This month", from: monthStart, to: today },
    { label: "Last month", from: `${lastMonthEnd.slice(0, 8)}01`, to: lastMonthEnd },
    { label: "This year", from: `${year}-01-01`, to: today },
    { label: "Last year", from: `${year - 1}-01-01`, to: `${year - 1}-12-31` },
  ];
}

// ── Summary for a window (KPIs, day-by-day, per course) ──────────────────────
//
// Each metric is one grouped query over the previous *and* current window
// together, bucketed by IST day in SQL; the KPI totals, the comparison and the
// chart are then all sums over the same rows, so they can never disagree.

export interface Kpi {
  value: number;
  prev: number;
  delta: number; // percent change vs previous window
}

export interface DailyRow {
  date: string;
  revenue: number;
  payments: number;
  enrollments: number;
  signups: number;
  completions: number;
}

export interface CoursePeriodRow {
  id: string;
  title: string;
  categoryName: string | null;
  revenue: number;
  payments: number;
  enrollments: number;
}

export interface AnalyticsSummary {
  period: AnalyticsWindow;
  kpis: {
    revenue: Kpi;
    payments: Kpi;
    enrollments: Kpi;
    signups: Kpi;
    completions: Kpi;
    // Snapshots of the platform right now — these have no per-day history to
    // slice by date, so they are the same whichever window is chosen.
    publishedCourses: number;
    activeLearners: number;
    avgRating: number;
  };
  /** One row per IST day of the window, oldest first, zero-filled. */
  daily: DailyRow[];
  /** Every course with a sale or an enrolment in the window (unsorted). */
  courses: CoursePeriodRow[];
}

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}

function kpi(value: number, prev: number): Kpi {
  return { value, prev, delta: pctChange(value, prev) };
}

/** Raw-query numbers arrive as bigint (COUNT), Decimal (SUM) or null. */
function num(value: unknown): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(typeof value === "bigint" ? value : String(value));
  return Number.isFinite(n) ? n : 0;
}

const money = (n: number) => Math.round(n * 100) / 100;

/** SQL for "which IST day does this UTC column fall on", as `YYYY-MM-DD`. */
function istDay(column: string): Prisma.Sql {
  return Prisma.raw(
    `DATE_FORMAT(DATE_ADD(\`${column}\`, INTERVAL ${IST_OFFSET_MINUTES} MINUTE), '%Y-%m-%d')`,
  );
}

type DayCount = { d: string; n: unknown };

export async function getAnalyticsSummary(period: AnalyticsWindow): Promise<AnalyticsSummary> {
  const start = istStart(period.from);
  const end = istStart(addDays(period.to, 1));
  const prevStart = istStart(period.prevFrom);

  const [payments, enrollments, completions, signups, snapshot, courses] = await Promise.all([
    prisma.$queryRaw<{ d: string; amount: unknown; n: unknown }[]>`
      SELECT ${istDay("paidAt")} AS d, SUM(netAmount) AS amount, COUNT(*) AS n
        FROM \`Payment\`
       WHERE status = 'PAID' AND paidAt >= ${prevStart} AND paidAt < ${end}
       GROUP BY d`,
    prisma.$queryRaw<DayCount[]>`
      SELECT ${istDay("createdAt")} AS d, COUNT(*) AS n
        FROM \`Enrollment\`
       WHERE createdAt >= ${prevStart} AND createdAt < ${end}
       GROUP BY d`,
    prisma.$queryRaw<DayCount[]>`
      SELECT ${istDay("completedAt")} AS d, COUNT(*) AS n
        FROM \`Enrollment\`
       WHERE status = 'COMPLETED' AND completedAt >= ${prevStart} AND completedAt < ${end}
       GROUP BY d`,
    prisma.$queryRaw<DayCount[]>`
      SELECT ${istDay("createdAt")} AS d, COUNT(*) AS n
        FROM \`User\`
       WHERE createdAt >= ${prevStart} AND createdAt < ${end}
       GROUP BY d`,
    prisma.$queryRaw<{ published: unknown; learners: unknown; rating: unknown }[]>`
      SELECT (SELECT COUNT(*) FROM \`Course\` WHERE status = 'PUBLISHED') AS published,
             (SELECT COUNT(DISTINCT userId) FROM \`Enrollment\`) AS learners,
             (SELECT AVG(ratingAvg) FROM \`Course\` WHERE ratingCount > 0) AS rating`,
    prisma.$queryRaw<
      { id: string; title: string; categoryName: string | null; enrollments: unknown; revenue: unknown; payments: unknown }[]
    >`
      SELECT c.id, c.title, cat.name AS categoryName,
             e.n AS enrollments, p.amount AS revenue, p.n AS payments
        FROM \`Course\` c
        LEFT JOIN \`Category\` cat ON cat.id = c.categoryId
        LEFT JOIN (SELECT courseId, COUNT(*) AS n
                     FROM \`Enrollment\`
                    WHERE createdAt >= ${start} AND createdAt < ${end}
                    GROUP BY courseId) e ON e.courseId = c.id
        LEFT JOIN (SELECT courseId, SUM(netAmount) AS amount, COUNT(*) AS n
                     FROM \`Payment\`
                    WHERE status = 'PAID' AND courseId IS NOT NULL
                      AND paidAt >= ${start} AND paidAt < ${end}
                    GROUP BY courseId) p ON p.courseId = c.id
       WHERE e.courseId IS NOT NULL OR p.courseId IS NOT NULL`,
  ]);

  const byDay = <T extends { d: string }>(rows: T[], pick: (r: T) => number) =>
    new Map(rows.map((r) => [r.d, pick(r)]));
  const rev = byDay(payments, (r) => num(r.amount));
  const pay = byDay(payments, (r) => num(r.n));
  const enr = byDay(enrollments, (r) => num(r.n));
  const comp = byDay(completions, (r) => num(r.n));
  const sig = byDay(signups, (r) => num(r.n));

  const row = (date: string): DailyRow => ({
    date,
    revenue: money(rev.get(date) ?? 0),
    payments: pay.get(date) ?? 0,
    enrollments: enr.get(date) ?? 0,
    signups: sig.get(date) ?? 0,
    completions: comp.get(date) ?? 0,
  });
  const daily = Array.from({ length: period.days }, (_, i) => row(addDays(period.from, i)));
  const prevDaily = Array.from({ length: period.days }, (_, i) => row(addDays(period.prevFrom, i)));
  const total = (rows: DailyRow[], key: Exclude<keyof DailyRow, "date">) =>
    rows.reduce((s, r) => s + r[key], 0);
  const metric = (key: Exclude<keyof DailyRow, "date">) => {
    const round = key === "revenue" ? money : (n: number) => n;
    return kpi(round(total(daily, key)), round(total(prevDaily, key)));
  };

  const snap = snapshot[0];
  return {
    period,
    kpis: {
      revenue: metric("revenue"),
      payments: metric("payments"),
      enrollments: metric("enrollments"),
      signups: metric("signups"),
      completions: metric("completions"),
      publishedCourses: num(snap?.published),
      activeLearners: num(snap?.learners),
      avgRating: Number(num(snap?.rating).toFixed(2)),
    },
    daily,
    courses: courses.map((c) => ({
      id: c.id,
      title: c.title,
      categoryName: c.categoryName,
      revenue: money(num(c.revenue)),
      payments: num(c.payments),
      enrollments: num(c.enrollments),
    })),
  };
}

/** Courses ranked by one measure, the other as the tie-break. */
export function topCoursesBy(
  courses: CoursePeriodRow[],
  by: "revenue" | "enrollments",
  limit: number,
): CoursePeriodRow[] {
  const other = by === "revenue" ? "enrollments" : "revenue";
  return [...courses]
    .sort((a, b) => b[by] - a[by] || b[other] - a[other] || a.title.localeCompare(b.title))
    .slice(0, limit);
}

/** Course revenue in the window, rolled up by category. */
export function revenueByCategory(courses: CoursePeriodRow[], limit = 6): Slice[] {
  const byCat = new Map<string, number>();
  for (const c of courses) {
    if (c.revenue <= 0) continue;
    const name = c.categoryName ?? "Uncategorised";
    byCat.set(name, (byCat.get(name) ?? 0) + c.revenue);
  }
  return Array.from(byCat, ([name, value]) => ({ name, value: money(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

// ── Trend series for the charts ──────────────────────────────────────────────
//
// Daily points up to three months; longer windows roll up into weeks (Monday
// start) and then months, so a year reads as a trend rather than 365 spikes.
// The first and last bucket may be partial — `hint` names the exact days.

export type TrendGranularity = "day" | "week" | "month";

export interface TrendPoint {
  date: string;
  label: string;
  hint: string;
  revenue: number;
  enrollments: number;
  signups: number;
}

export function trendGranularity(days: number): TrendGranularity {
  return days <= 92 ? "day" : days <= 366 ? "week" : "month";
}

export function toTrendSeries(daily: DailyRow[]): TrendPoint[] {
  const granularity = trendGranularity(daily.length);
  const buckets = new Map<string, { first: string; last: string; revenue: number; enrollments: number; signups: number }>();
  for (const r of daily) {
    const key =
      granularity === "day"
        ? r.date
        : granularity === "month"
          ? r.date.slice(0, 7)
          : addDays(r.date, -((new Date(`${r.date}T00:00:00Z`).getUTCDay() + 6) % 7));
    const b = buckets.get(key) ?? { first: r.date, last: r.date, revenue: 0, enrollments: 0, signups: 0 };
    b.last = r.date;
    b.revenue += r.revenue;
    b.enrollments += r.enrollments;
    b.signups += r.signups;
    buckets.set(key, b);
  }
  return Array.from(buckets.values(), (b) => ({
    date: b.first,
    label:
      granularity === "month"
        ? `${MONTHS[Number(b.first.slice(5, 7)) - 1]} ${b.first.slice(0, 4)}`
        : shortDay(b.first),
    hint: formatDayRange(b.first, b.last),
    revenue: money(b.revenue),
    enrollments: b.enrollments,
    signups: b.signups,
  }));
}

// ── Downloadable report (CSV) ────────────────────────────────────────────────

/** Excel runs a cell starting with = + - @ as a formula; keep names as text. */
function asText(value: string | null): string {
  const s = value ?? "";
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/** "2026-09-20 14:05 IST" */
function istStamp(at: Date): string {
  return `${new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ")} IST`;
}

export function analyticsReportFilename(period: AnalyticsWindow): string {
  return `skillforcareer-analytics-${period.from}_to_${period.to}.csv`;
}

/**
 * The report as one CSV: a heading block, the KPI summary with the previous
 * period and change, the day-by-day table with a total row, and the top courses
 * by revenue and by enrolments. Sections are separated by a blank line so the
 * sheet reads top to bottom in Excel or Google Sheets.
 */
export function analyticsReportCsv(summary: AnalyticsSummary, generatedAt = new Date()): string {
  const { period: w, kpis, daily, courses } = summary;
  const amount = (n: number) => n.toFixed(2);
  const section = (title: string, headers: string[], rows: (string | number)[][]) =>
    `${toCsv([title], [])}\r\n${toCsv(headers, rows)}`;

  const heading = toCsv(
    ["Skill For Career — Analytics report"],
    [
      ["Period", `${w.from} to ${w.to}`, `${w.days} ${w.days === 1 ? "day" : "days"}`],
      ["Compared with", `${w.prevFrom} to ${w.prevTo}`, "previous period of the same length"],
      ["Dates in", "India Standard Time (IST)"],
      ["Generated", istStamp(generatedAt)],
    ],
  );

  const kpiRow = (label: string, k: Kpi, isMoney = false) => [
    label,
    isMoney ? amount(k.value) : k.value,
    isMoney ? amount(k.prev) : k.prev,
    k.delta,
  ];
  const summaryTable = section(
    "Summary",
    ["Metric", "This period", "Previous period", "Change %"],
    [
      kpiRow("Revenue (₹)", kpis.revenue, true),
      kpiRow("Paid payments", kpis.payments),
      kpiRow("Enrollments", kpis.enrollments),
      kpiRow("New sign-ups", kpis.signups),
      kpiRow("Completions", kpis.completions),
    ],
  );

  const snapshotTable = section(
    "Platform right now",
    ["Metric", "Value"],
    [
      ["Published courses", kpis.publishedCourses],
      ["Active learners (all time)", kpis.activeLearners],
      ["Average course rating", kpis.avgRating ? kpis.avgRating.toFixed(2) : ""],
    ],
  );

  const dailyTable = section(
    "Day by day",
    ["Date", "Revenue (₹)", "Payments", "Enrollments", "New sign-ups", "Completions"],
    [
      ...daily.map((r) => [r.date, amount(r.revenue), r.payments, r.enrollments, r.signups, r.completions]),
      [
        "Total",
        amount(kpis.revenue.value),
        kpis.payments.value,
        kpis.enrollments.value,
        kpis.signups.value,
        kpis.completions.value,
      ],
    ],
  );

  const courseTable = (title: string, by: "revenue" | "enrollments") => {
    const top = topCoursesBy(courses, by, 10);
    return section(
      title,
      ["Rank", "Course", "Category", "Revenue (₹)", "Payments", "Enrollments"],
      top.length === 0
        ? [["", "No course sales or enrolments in this period"]]
        : top.map((c, i) => [
            i + 1,
            asText(c.title),
            asText(c.categoryName),
            amount(c.revenue),
            c.payments,
            c.enrollments,
          ]),
    );
  };

  return [
    heading,
    summaryTable,
    snapshotTable,
    dailyTable,
    courseTable("Top courses by revenue", "revenue"),
    courseTable("Top courses by enrollments", "enrollments"),
  ].join("\r\n\r\n");
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
    // An instructor's batches are the ones they lead or assist on.
    where: instructorId
      ? { OR: [{ instructorId }, { associates: { some: { userId: instructorId } } }] }
      : {},
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
