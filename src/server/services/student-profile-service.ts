import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import type { BatchSchedule } from "@/lib/validations/batch";

/**
 * The single record of a learner: what they bought, which cohort they sit in,
 * how many classes they have actually turned up to, what they have submitted,
 * and whether their certificate has gone out.
 *
 * It exists because admissions were answering those questions by opening six
 * screens. Everything here is derived from rows the platform already keeps —
 * nothing is denormalised onto the user, so the picture can't drift out of date.
 */

const num = (d: Prisma.Decimal | null) => (d == null ? null : d.toNumber());

function parseSchedule(json: Prisma.JsonValue | null): BatchSchedule | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const days = Array.isArray(o.days)
    ? (o.days.filter((d) => typeof d === "string") as string[])
    : [];
  return {
    days: days as BatchSchedule["days"],
    startTime: typeof o.startTime === "string" ? o.startTime : "",
    endTime: typeof o.endTime === "string" ? o.endTime : "",
  };
}

export interface StudentEnrollment {
  id: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  status: string;
  progressPercent: number;
  enrolledAt: string;
  completedAt: string | null;
  batch: {
    id: string;
    name: string;
    code: string;
    status: string;
    startDate: string | null;
    endDate: string | null;
    schedule: BatchSchedule | null;
    instructorName: string | null;
  } | null;
  certificate: {
    id: string;
    serialNumber: string;
    verificationCode: string;
    status: string;
    issuedAt: string;
  } | null;
}

export interface StudentAttendance {
  /** Sessions scheduled for this learner's cohorts that have already run. */
  held: number;
  present: number;
  absent: number;
  /** Held sessions with no attendance row — nobody took the register. */
  unmarked: number;
  /** Scheduled and still to come. */
  upcoming: number;
  percent: number | null;
}

export interface StudentPayment {
  id: string;
  invoiceNumber: string;
  netAmount: number;
  status: string;
  method: string | null;
  provider: string;
  courseTitle: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface StudentProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  status: string;
  role: string;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  /** The internship this learner served, as recorded on their account. */
  internshipStartAt: string | null;
  internshipEndAt: string | null;
  /**
   * "Date of joining" — the earliest of their first enrolment and their first
   * settled payment. A walk-in who pays fees before a batch is assigned has
   * joined the academy that day, whatever the enrolment table says yet.
   */
  joinedCourseAt: string | null;
  enrollments: StudentEnrollment[];
  attendance: StudentAttendance;
  quizzes: { completed: number; attempted: number; averagePercent: number | null };
  assignments: { completed: number; graded: number; assigned: number };
  certificates: { issued: number; revoked: number };
  payments: StudentPayment[];
  paidTotal: number;
  pendingTotal: number;
  /** The CRM enquiry this learner came from, when there was one. */
  lead: { id: string; leadNo: string | null; source: string } | null;
}

/** Sessions already over count against attendance; the rest are still ahead. */
const HELD_STATUSES = ["ENDED", "LIVE"] as const;

/** Whichever came first: the enrolment, or the money. */
function joinedAt(firstEnrolment: Date | null, paid: StudentPayment[]): string | null {
  const dates: number[] = [];
  if (firstEnrolment) dates.push(firstEnrolment.getTime());
  for (const p of paid) dates.push(new Date(p.paidAt ?? p.createdAt).getTime());
  return dates.length ? new Date(Math.min(...dates)).toISOString() : null;
}

export async function getStudentProfile(userId: string): Promise<StudentProfile> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      avatarUrl: true,
      status: true,
      emailVerified: true,
      createdAt: true,
      lastLoginAt: true,
      internshipStartAt: true,
      internshipEndAt: true,
      role: { select: { name: true, slug: true } },
    },
  });
  if (!user) throw AppError.notFound("User not found.");

  const enrollments = await prisma.enrollment.findMany({
    where: { userId },
    orderBy: { enrolledAt: "asc" },
    select: {
      id: true,
      courseId: true,
      status: true,
      progressPercent: true,
      enrolledAt: true,
      completedAt: true,
      course: { select: { title: true, slug: true } },
      batch: {
        select: {
          id: true,
          name: true,
          code: true,
          status: true,
          startDate: true,
          endDate: true,
          schedule: true,
          instructor: { select: { name: true } },
        },
      },
      certificate: {
        select: {
          id: true,
          serialNumber: true,
          verificationCode: true,
          status: true,
          issuedAt: true,
        },
      },
    },
  });

  const batchIds = enrollments.map((e) => e.batch?.id).filter((id): id is string => !!id);
  const courseIds = enrollments.map((e) => e.courseId);

  // Everything else is independent of everything else, so it goes in one wave
  // rather than six sequential round-trips to a database a region away.
  const [
    meetingCounts,
    attendanceRows,
    quizAttempts,
    submissions,
    assignedCount,
    payments,
    lead,
  ] = await Promise.all([
    batchIds.length
      ? prisma.meeting.groupBy({
          by: ["status"],
          where: { batchId: { in: batchIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    prisma.attendance.groupBy({
      by: ["status"],
      where: { userId },
      _count: { _all: true },
    }),
    prisma.quizAttempt.findMany({
      where: { studentId: userId },
      select: { status: true, score: true, maxScore: true },
    }),
    prisma.assignmentSubmission.findMany({
      where: { studentId: userId },
      select: { status: true },
    }),
    courseIds.length
      ? prisma.assignment.count({ where: { courseId: { in: courseIds } } })
      : Promise.resolve(0),
    prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        invoiceNumber: true,
        netAmount: true,
        status: true,
        method: true,
        provider: true,
        paidAt: true,
        createdAt: true,
        course: { select: { title: true } },
      },
    }),
    prisma.lead.findFirst({
      where: { convertedUserId: userId },
      select: { id: true, leadNo: true, source: true },
    }),
  ]);

  // ── Attendance ─────────────────────────────────────────────────────────────
  const byMeetingStatus = Object.fromEntries(
    meetingCounts.map((m) => [m.status, m._count._all]),
  ) as Record<string, number>;
  const held = HELD_STATUSES.reduce((n, s) => n + (byMeetingStatus[s] ?? 0), 0);
  const upcoming = byMeetingStatus.SCHEDULED ?? 0;

  const byAttendance = Object.fromEntries(
    attendanceRows.map((a) => [a.status, a._count._all]),
  ) as Record<string, number>;
  // LATE and LEFT_EARLY are attendance, not absence — the learner was there.
  const present =
    (byAttendance.PRESENT ?? 0) + (byAttendance.LATE ?? 0) + (byAttendance.LEFT_EARLY ?? 0);
  const absent = byAttendance.ABSENT ?? 0;
  const marked = present + absent;

  const attendance: StudentAttendance = {
    held,
    present,
    absent,
    // Never negative: a register can be taken for a session the batch filter
    // above doesn't cover (a one-off class, a batch transfer).
    unmarked: Math.max(0, held - marked),
    upcoming,
    // Measured against what was actually marked. Dividing by `held` would read
    // as truancy whenever an instructor simply forgot to take the register.
    percent: marked > 0 ? Math.round((present / marked) * 100) : null,
  };

  // ── Assessments ────────────────────────────────────────────────────────────
  const finished = quizAttempts.filter(
    (a) => a.status === "SUBMITTED" || a.status === "GRADED",
  );
  const scored = finished.filter((a) => a.score != null && a.maxScore > 0);
  const quizzes = {
    completed: finished.length,
    attempted: quizAttempts.length,
    averagePercent: scored.length
      ? Math.round(
          (scored.reduce((sum, a) => sum + (a.score as number) / a.maxScore, 0) /
            scored.length) *
            100,
        )
      : null,
  };

  const submitted = submissions.filter((s) => s.status !== "DRAFT");
  const assignments = {
    completed: submitted.length,
    graded: submissions.filter((s) => s.status === "GRADED").length,
    assigned: assignedCount,
  };

  // ── Money ──────────────────────────────────────────────────────────────────
  const paymentRows: StudentPayment[] = payments.map((p) => ({
    id: p.id,
    invoiceNumber: p.invoiceNumber,
    netAmount: num(p.netAmount) ?? 0,
    status: p.status,
    method: p.method,
    provider: p.provider,
    courseTitle: p.course?.title ?? null,
    paidAt: p.paidAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  }));

  const certs = enrollments.map((e) => e.certificate).filter((c) => c != null);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    status: user.status,
    role: user.role.name,
    emailVerified: user.emailVerified != null,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    internshipStartAt: user.internshipStartAt?.toISOString() ?? null,
    internshipEndAt: user.internshipEndAt?.toISOString() ?? null,
    joinedCourseAt: joinedAt(
      enrollments[0]?.enrolledAt ?? null,
      paymentRows.filter((p) => p.status === "PAID"),
    ),
    enrollments: enrollments.map((e) => ({
      id: e.id,
      courseId: e.courseId,
      courseTitle: e.course.title,
      courseSlug: e.course.slug,
      status: e.status,
      progressPercent: e.progressPercent,
      enrolledAt: e.enrolledAt.toISOString(),
      completedAt: e.completedAt?.toISOString() ?? null,
      batch: e.batch
        ? {
            id: e.batch.id,
            name: e.batch.name,
            code: e.batch.code,
            status: e.batch.status,
            startDate: e.batch.startDate?.toISOString() ?? null,
            endDate: e.batch.endDate?.toISOString() ?? null,
            schedule: parseSchedule(e.batch.schedule),
            instructorName: e.batch.instructor?.name ?? null,
          }
        : null,
      certificate: e.certificate
        ? {
            id: e.certificate.id,
            serialNumber: e.certificate.serialNumber,
            verificationCode: e.certificate.verificationCode,
            status: e.certificate.status,
            issuedAt: e.certificate.issuedAt.toISOString(),
          }
        : null,
    })),
    attendance,
    quizzes,
    assignments,
    certificates: {
      issued: certs.filter((c) => c.status === "ISSUED").length,
      revoked: certs.filter((c) => c.status === "REVOKED").length,
    },
    payments: paymentRows,
    paidTotal: paymentRows
      .filter((p) => p.status === "PAID")
      .reduce((sum, p) => sum + p.netAmount, 0),
    pendingTotal: paymentRows
      .filter((p) => p.status === "PENDING")
      .reduce((sum, p) => sum + p.netAmount, 0),
    lead,
  };
}
