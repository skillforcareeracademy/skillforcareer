import { prisma } from "@/lib/prisma";

/**
 * A learner's own attendance register.
 *
 * The admin 360 profile already summarises this into four numbers; what the
 * client asked for on the learner's side is the register itself — which class,
 * which day, present or not. Built from `Attendance` rows joined back onto the
 * `Meeting`s their cohorts were scheduled for, so a class nobody marked shows
 * as "not marked" rather than silently as an absence.
 */

export interface AttendanceEntry {
  id: string;
  meetingId: string | null;
  title: string;
  courseTitle: string | null;
  batchName: string | null;
  scheduledAt: string;
  /** PRESENT / ABSENT / LATE / LEFT_EARLY, or the two derived states below. */
  status: "PRESENT" | "ABSENT" | "LATE" | "LEFT_EARLY" | "UNMARKED" | "UPCOMING";
  durationSeconds: number;
  joinedAt: string | null;
}

export interface StudentAttendanceReport {
  held: number;
  present: number;
  absent: number;
  unmarked: number;
  upcoming: number;
  /** Measured against *marked* sessions, so an unmarked register can't drag it down. */
  percent: number | null;
  entries: AttendanceEntry[];
}

const PRESENT_STATES = new Set(["PRESENT", "LATE", "LEFT_EARLY"]);

export async function getStudentAttendance(
  userId: string,
): Promise<StudentAttendanceReport> {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: {
      batchId: true,
      course: { select: { title: true } },
      batch: { select: { id: true, name: true } },
    },
  });

  const batchIds = enrollments
    .map((e) => e.batchId)
    .filter((id): id is string => Boolean(id));

  // Every session this learner's cohorts were scheduled for, plus every
  // attendance row they own — the second catches one-off classes they were
  // added to outside a batch.
  const [meetings, rows] = await Promise.all([
    batchIds.length
      ? prisma.meeting.findMany({
          // Timetables are generated months ahead; without a horizon the
          // newest-first page of 200 could be all future classes and push
          // every attended one off the report.
          where: {
            batchId: { in: batchIds },
            scheduledStart: { lte: new Date(Date.now() + 7 * 86_400_000) },
          },
          orderBy: { scheduledStart: "desc" },
          take: 200,
          select: {
            id: true,
            title: true,
            status: true,
            scheduledStart: true,
            batchId: true,
            course: { select: { title: true } },
            batch: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    prisma.attendance.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 300,
      select: {
        id: true,
        meetingId: true,
        status: true,
        date: true,
        joinedAt: true,
        durationSeconds: true,
        meeting: {
          select: {
            title: true,
            scheduledStart: true,
            course: { select: { title: true } },
            batch: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const byMeeting = new Map(rows.filter((r) => r.meetingId).map((r) => [r.meetingId!, r]));
  const now = Date.now();

  const entries: AttendanceEntry[] = meetings.map((m) => {
    const row = byMeeting.get(m.id);
    const upcoming = m.status === "SCHEDULED" && m.scheduledStart.getTime() > now;
    return {
      id: row?.id ?? m.id,
      meetingId: m.id,
      title: m.title,
      courseTitle: m.course?.title ?? null,
      batchName: m.batch?.name ?? null,
      scheduledAt: m.scheduledStart.toISOString(),
      status: row
        ? (row.status as AttendanceEntry["status"])
        : upcoming
          ? "UPCOMING"
          : m.status === "CANCELLED"
            ? "UNMARKED"
            : "UNMARKED",
      durationSeconds: row?.durationSeconds ?? 0,
      joinedAt: row?.joinedAt?.toISOString() ?? null,
    };
  });

  // Attendance rows for sessions outside the cohort schedule — a make-up class,
  // or a batch the learner has since left.
  const seen = new Set(meetings.map((m) => m.id));
  for (const r of rows) {
    if (r.meetingId && seen.has(r.meetingId)) continue;
    entries.push({
      id: r.id,
      meetingId: r.meetingId,
      title: r.meeting?.title ?? "Class",
      courseTitle: r.meeting?.course?.title ?? null,
      batchName: r.meeting?.batch?.name ?? null,
      scheduledAt: (r.meeting?.scheduledStart ?? r.date).toISOString(),
      status: r.status as AttendanceEntry["status"],
      durationSeconds: r.durationSeconds,
      joinedAt: r.joinedAt?.toISOString() ?? null,
    });
  }

  entries.sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));

  const upcoming = entries.filter((e) => e.status === "UPCOMING").length;
  const unmarked = entries.filter((e) => e.status === "UNMARKED").length;
  const present = entries.filter((e) => PRESENT_STATES.has(e.status)).length;
  const absent = entries.filter((e) => e.status === "ABSENT").length;
  const marked = present + absent;

  return {
    held: entries.length - upcoming,
    present,
    absent,
    unmarked,
    upcoming,
    percent: marked > 0 ? Math.round((present / marked) * 100) : null,
    entries,
  };
}
