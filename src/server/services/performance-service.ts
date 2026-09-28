import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getStudentFees } from "./student-payment-service";
import { getWalletView } from "./wallet-service";
import { noteReadingSummary, type NoteReadingSummary } from "./note-read-service";

/**
 * A learner's performance, in one place.
 *
 * The academy's ask: "student ke panel me uski performance dikhni chahiye —
 * attendance, classes attended, notes padhne ka time, assignments, quizzes,
 * upcoming aur pending classes, referrals aur earning, webinars, fees." The
 * same figures make up the report card the office downloads, so both read this
 * one service and nothing is counted twice over.
 *
 * Everything here is aggregated in the database. With `relationMode = "prisma"`
 * a nested `include` costs a round-trip per relation, and a scorecard touches
 * nine of them — so these are grouped queries, one per dimension, whatever the
 * number of courses.
 */

const PRESENT = ["PRESENT", "LATE", "LEFT_EARLY"];
const n = (v: bigint | number | null | undefined): number => Number(v ?? 0);
const pct = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 100) : null;

export interface CoursePerformance {
  enrollmentId: string;
  courseId: string;
  courseTitle: string;
  batchId: string | null;
  batchName: string | null;
  status: string;
  enrolledAt: string;
  completedAt: string | null;
  progressPercent: number;
  lessonsTotal: number;
  lessonsCompleted: number;
  watchSeconds: number;
  classesHeld: number;
  classesAttended: number;
  attendancePercent: number | null;
  assignmentsSubmitted: number;
  assignmentsGraded: number;
  assignmentAvgPercent: number | null;
  quizzesTaken: number;
  quizAvgPercent: number | null;
  quizBestPercent: number | null;
  certificateSerial: string | null;
}

export interface ClassBrief {
  id: string;
  title: string;
  courseTitle: string | null;
  batchName: string | null;
  scheduledStart: string;
  roomCode: string;
  location: string | null;
}

export interface StudentScorecard {
  courses: CoursePerformance[];
  totals: {
    enrolled: number;
    completed: number;
    inProgress: number;
    certificates: number;
    lessonsTotal: number;
    lessonsCompleted: number;
    watchSeconds: number;
    progressPercent: number | null;
  };
  attendance: {
    held: number;
    attended: number;
    percent: number | null;
    /** Time actually spent in class, and the classes' own length. */
    attendedSeconds: number;
    classSeconds: number;
  };
  classes: { next: ClassBrief | null; last: ClassBrief | null; pending: number };
  notes: NoteReadingSummary;
  assignments: {
    submitted: number;
    graded: number;
    pending: number;
    avgPercent: number | null;
  };
  quizzes: {
    taken: number;
    avgPercent: number | null;
    bestPercent: number | null;
    timeSeconds: number;
  };
  webinars: { registered: number; attended: number };
  referrals: { invited: number; joined: number; earned: number; walletBalance: number };
  fees: {
    billed: number;
    paid: number;
    due: number;
    status: "PAID" | "PARTIAL" | "UNPAID" | "NONE";
    nextDueDate: string | null;
    nextDueAmount: number | null;
    emiPending: number;
  };
}

interface EnrolmentRow {
  id: string;
  courseId: string;
  batchId: string | null;
  status: string;
  progressPercent: number;
  enrolledAt: Date;
  completedAt: Date | null;
  courseTitle: string;
  batchName: string | null;
}

export async function studentScorecard(userId: string): Promise<StudentScorecard> {
  const enrolments = await prisma.$queryRaw<EnrolmentRow[]>`
    SELECT e.id, e.courseId, e.batchId, e.status, e.progressPercent,
           e.enrolledAt, e.completedAt,
           c.title AS courseTitle, b.name AS batchName
      FROM Enrollment e
      JOIN Course c ON c.id = e.courseId
      LEFT JOIN Batch b ON b.id = e.batchId
     WHERE e.userId = ${userId}
     ORDER BY e.enrolledAt DESC`;

  const courseIds = enrolments.map((e) => e.courseId);
  const batchIds = enrolments.map((e) => e.batchId).filter((b): b is string => Boolean(b));
  const noCourses = courseIds.length === 0;

  const [
    lessonRows,
    attendanceRows,
    assignmentRows,
    quizRows,
    certificates,
    classRows,
    pendingClasses,
    notes,
    webinars,
    referrals,
    wallet,
    fees,
  ] = await Promise.all([
    // Lessons in each course, and how far this learner has got through them.
    noCourses
      ? []
      : prisma.$queryRaw<
          { courseId: string; total: bigint; completed: bigint | null; watchSeconds: bigint | null }[]
        >`
          SELECT ch.courseId,
                 COUNT(DISTINCT l.id) AS total,
                 SUM(CASE WHEN lp.completed = 1 THEN 1 ELSE 0 END) AS completed,
                 COALESCE(SUM(lp.watchedSeconds), 0) AS watchSeconds
            FROM Chapter ch
            JOIN Lesson l ON l.chapterId = ch.id
            LEFT JOIN LessonProgress lp ON lp.lessonId = l.id AND lp.userId = ${userId}
           WHERE ch.courseId IN (${Prisma.join(courseIds)})
           GROUP BY ch.courseId`,
    // Classes already held for their cohorts, and which they turned up to. A
    // class nobody marked counts as held but not attended, which is what the
    // register shows too.
    batchIds.length === 0
      ? []
      : prisma.$queryRaw<
          {
            batchId: string;
            held: bigint;
            attended: bigint | null;
            attendedSeconds: bigint | null;
            classSeconds: bigint | null;
          }[]
        >`
          SELECT m.batchId,
                 COUNT(*) AS held,
                 SUM(CASE WHEN a.status IN (${Prisma.join(PRESENT)}) THEN 1 ELSE 0 END) AS attended,
                 COALESCE(SUM(a.durationSeconds), 0) AS attendedSeconds,
                 -- Only a class with a known finish contributes a length, so the
                 -- comparison is never against a half-known total.
                 COALESCE(SUM(
                   TIMESTAMPDIFF(
                     SECOND,
                     COALESCE(m.actualStart, m.scheduledStart),
                     COALESCE(m.actualEnd, m.scheduledEnd)
                   )
                 ), 0) AS classSeconds
            FROM Meeting m
            LEFT JOIN Attendance a ON a.meetingId = m.id AND a.userId = ${userId}
           WHERE m.batchId IN (${Prisma.join(batchIds)})
             AND m.status <> 'CANCELLED'
             AND m.scheduledStart <= NOW()
           GROUP BY m.batchId`,
    // Assignment marks, as a percentage of what each was out of.
    prisma.$queryRaw<
      {
        courseId: string | null;
        submitted: bigint;
        graded: bigint | null;
        scoreSum: number | null;
        maxSum: number | null;
      }[]
    >`
      SELECT a.courseId,
             COUNT(*) AS submitted,
             SUM(CASE WHEN s.status = 'GRADED' THEN 1 ELSE 0 END) AS graded,
             SUM(CASE WHEN s.score IS NOT NULL THEN s.score ELSE 0 END) AS scoreSum,
             SUM(CASE WHEN s.score IS NOT NULL THEN a.maxScore ELSE 0 END) AS maxSum
        FROM AssignmentSubmission s
        JOIN Assignment a ON a.id = s.assignmentId
       WHERE s.studentId = ${userId}
         AND s.status <> 'DRAFT'
       GROUP BY a.courseId`,
    // Quiz marks. Only finished attempts count — an abandoned one is not a score.
    prisma.$queryRaw<
      {
        courseId: string | null;
        taken: bigint;
        scoreSum: number | null;
        maxSum: number | null;
        bestPercent: number | null;
        timeSeconds: bigint | null;
      }[]
    >`
      SELECT q.courseId,
             COUNT(*) AS taken,
             SUM(COALESCE(t.score, 0)) AS scoreSum,
             SUM(t.maxScore) AS maxSum,
             MAX(CASE WHEN t.maxScore > 0
                      THEN ROUND(COALESCE(t.score, 0) * 100 / t.maxScore)
                      ELSE NULL END) AS bestPercent,
             COALESCE(SUM(t.timeSpentSeconds), 0) AS timeSeconds
        FROM QuizAttempt t
        JOIN Quiz q ON q.id = t.quizId
       WHERE t.studentId = ${userId}
         AND t.status IN ('SUBMITTED', 'GRADED')
       GROUP BY q.courseId`,
    prisma.certificate.findMany({
      where: { userId, status: { not: "REVOKED" } },
      select: { courseId: true, serialNumber: true },
    }),
    // The class either side of now: the next one to attend, and the last held.
    batchIds.length === 0
      ? []
      : prisma.$queryRaw<
          {
            id: string;
            title: string;
            courseTitle: string | null;
            batchName: string | null;
            scheduledStart: Date;
            roomCode: string;
            location: string | null;
            side: string;
          }[]
        >`
          (SELECT m.id, m.title, c.title AS courseTitle, b.name AS batchName,
                  m.scheduledStart, m.roomCode, m.location, 'next' AS side
             FROM Meeting m
             LEFT JOIN Course c ON c.id = m.courseId
             LEFT JOIN Batch b ON b.id = m.batchId
            WHERE m.batchId IN (${Prisma.join(batchIds)})
              AND m.status <> 'CANCELLED'
              AND m.scheduledStart >= NOW()
            ORDER BY m.scheduledStart ASC
            LIMIT 1)
          UNION ALL
          (SELECT m.id, m.title, c.title AS courseTitle, b.name AS batchName,
                  m.scheduledStart, m.roomCode, m.location, 'last' AS side
             FROM Meeting m
             LEFT JOIN Course c ON c.id = m.courseId
             LEFT JOIN Batch b ON b.id = m.batchId
            WHERE m.batchId IN (${Prisma.join(batchIds)})
              AND m.status <> 'CANCELLED'
              AND m.scheduledStart < NOW()
            ORDER BY m.scheduledStart DESC
            LIMIT 1)`,
    batchIds.length === 0
      ? 0
      : prisma.meeting.count({
          where: {
            batchId: { in: batchIds },
            status: { not: "CANCELLED" },
            scheduledStart: { gte: new Date() },
          },
        }),
    noteReadingSummary(userId),
    prisma.$queryRaw<{ registered: bigint; attended: bigint | null }[]>`
      SELECT COUNT(*) AS registered,
             SUM(CASE WHEN attendedSeconds > 0 OR joinedAt IS NOT NULL THEN 1 ELSE 0 END) AS attended
        FROM WebinarRegistration
       WHERE userId = ${userId}`,
    prisma.$queryRaw<{ invited: bigint; joined: bigint | null; earned: number | null }[]>`
      SELECT COUNT(*) AS invited,
             SUM(CASE WHEN refereeId IS NOT NULL THEN 1 ELSE 0 END) AS joined,
             COALESCE(SUM(CASE WHEN status = 'REWARDED' THEN rewardAmount ELSE 0 END), 0) AS earned
        FROM Referral
       WHERE referrerId = ${userId}`,
    getWalletView(userId),
    getStudentFees(userId),
  ]);

  const lessonsBy = new Map(lessonRows.map((r) => [r.courseId, r]));
  const attendanceBy = new Map(attendanceRows.map((r) => [r.batchId, r]));
  const assignmentsBy = new Map(assignmentRows.map((r) => [r.courseId ?? "", r]));
  const quizzesBy = new Map(quizRows.map((r) => [r.courseId ?? "", r]));
  const certificateBy = new Map(
    certificates.filter((c) => c.courseId).map((c) => [c.courseId!, c.serialNumber]),
  );

  const courses: CoursePerformance[] = enrolments.map((e) => {
    const lessons = lessonsBy.get(e.courseId);
    const attendance = e.batchId ? attendanceBy.get(e.batchId) : undefined;
    const assignment = assignmentsBy.get(e.courseId);
    const quiz = quizzesBy.get(e.courseId);
    const held = n(attendance?.held);
    const attended = n(attendance?.attended);
    return {
      enrollmentId: e.id,
      courseId: e.courseId,
      courseTitle: e.courseTitle,
      batchId: e.batchId,
      batchName: e.batchName,
      status: e.status,
      enrolledAt: new Date(e.enrolledAt).toISOString(),
      completedAt: e.completedAt ? new Date(e.completedAt).toISOString() : null,
      progressPercent: Math.round(e.progressPercent),
      lessonsTotal: n(lessons?.total),
      lessonsCompleted: n(lessons?.completed),
      watchSeconds: n(lessons?.watchSeconds),
      classesHeld: held,
      classesAttended: attended,
      attendancePercent: pct(attended, held),
      assignmentsSubmitted: n(assignment?.submitted),
      assignmentsGraded: n(assignment?.graded),
      assignmentAvgPercent: pct(n(assignment?.scoreSum), n(assignment?.maxSum)),
      quizzesTaken: n(quiz?.taken),
      quizAvgPercent: pct(n(quiz?.scoreSum), n(quiz?.maxSum)),
      quizBestPercent: quiz?.bestPercent == null ? null : Math.round(Number(quiz.bestPercent)),
      certificateSerial: certificateBy.get(e.courseId) ?? null,
    };
  });

  const brief = (side: string): ClassBrief | null => {
    const row = classRows.find((r) => r.side === side);
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      courseTitle: row.courseTitle,
      batchName: row.batchName,
      scheduledStart: new Date(row.scheduledStart).toISOString(),
      roomCode: row.roomCode,
      location: row.location,
    };
  };

  const heldTotal = attendanceRows.reduce((s, r) => s + n(r.held), 0);
  const attendedTotal = attendanceRows.reduce((s, r) => s + n(r.attended), 0);
  const lessonsTotal = courses.reduce((s, c) => s + c.lessonsTotal, 0);
  const lessonsCompleted = courses.reduce((s, c) => s + c.lessonsCompleted, 0);
  const assignmentScore = assignmentRows.reduce((s, r) => s + n(r.scoreSum), 0);
  const assignmentMax = assignmentRows.reduce((s, r) => s + n(r.maxSum), 0);
  const quizScore = quizRows.reduce((s, r) => s + n(r.scoreSum), 0);
  const quizMax = quizRows.reduce((s, r) => s + n(r.maxSum), 0);
  const bestPercents = quizRows
    .map((r) => (r.bestPercent == null ? null : Number(r.bestPercent)))
    .filter((v): v is number => v != null);

  // Assignments set for this learner but not yet handed in.
  const assignedCount = await prisma.assignmentStudent.count({ where: { userId } });
  const submittedCount = assignmentRows.reduce((s, r) => s + n(r.submitted), 0);

  return {
    courses,
    totals: {
      enrolled: courses.length,
      completed: courses.filter((c) => c.status === "COMPLETED" || c.progressPercent >= 100).length,
      inProgress: courses.filter((c) => c.progressPercent > 0 && c.progressPercent < 100).length,
      certificates: certificates.length,
      lessonsTotal,
      lessonsCompleted,
      watchSeconds: courses.reduce((s, c) => s + c.watchSeconds, 0),
      progressPercent: pct(lessonsCompleted, lessonsTotal),
    },
    attendance: {
      held: heldTotal,
      attended: attendedTotal,
      percent: pct(attendedTotal, heldTotal),
      attendedSeconds: attendanceRows.reduce((s, r) => s + n(r.attendedSeconds), 0),
      classSeconds: attendanceRows.reduce((s, r) => s + n(r.classSeconds), 0),
    },
    classes: { next: brief("next"), last: brief("last"), pending: pendingClasses },
    notes,
    assignments: {
      submitted: submittedCount,
      graded: assignmentRows.reduce((s, r) => s + n(r.graded), 0),
      pending: Math.max(0, assignedCount - submittedCount),
      avgPercent: pct(assignmentScore, assignmentMax),
    },
    quizzes: {
      taken: quizRows.reduce((s, r) => s + n(r.taken), 0),
      avgPercent: pct(quizScore, quizMax),
      bestPercent: bestPercents.length ? Math.max(...bestPercents) : null,
      timeSeconds: quizRows.reduce((s, r) => s + n(r.timeSeconds), 0),
    },
    webinars: {
      registered: n(webinars[0]?.registered),
      attended: n(webinars[0]?.attended),
    },
    referrals: {
      invited: n(referrals[0]?.invited),
      joined: n(referrals[0]?.joined),
      earned: Number(referrals[0]?.earned ?? 0),
      walletBalance: wallet.balance,
    },
    fees: {
      billed: fees.totalBilled,
      paid: fees.totalPaid,
      due: fees.totalDue,
      status: fees.overallStatus,
      nextDueDate: fees.emi.nextDueDate,
      nextDueAmount: fees.emi.nextDueAmount,
      emiPending: fees.emi.pendingCount,
    },
  };
}

/** Who the card is about — the header line on the printed copy. */
export interface ReportCardLearner {
  name: string;
  email: string;
  phone: string | null;
  joinedAt: string;
}

/**
 * The whole card, ready to render: the learner's details and their figures.
 * The learner's own tab and the office's copy both call this, so the two can
 * never drift apart.
 */
export async function reportCardFor(
  userId: string,
): Promise<{ learner: ReportCardLearner; card: StudentScorecard }> {
  const [user, card] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true, email: true, phone: true, createdAt: true },
    }),
    studentScorecard(userId),
  ]);
  return {
    learner: {
      name: user.name,
      email: user.email,
      phone: user.phone,
      joinedAt: user.createdAt.toISOString(),
    },
    card,
  };
}

/** The course-wise table as a spreadsheet — what the office downloads. */
export function reportCardCsv(learner: ReportCardLearner, card: StudentScorecard): {
  headers: string[];
  rows: (string | number)[][];
} {
  const headers = [
    "Student",
    "Email",
    "Phone",
    "Course",
    "Batch",
    "Status",
    "Enrolled on",
    "Lessons completed",
    "Lessons total",
    "Progress %",
    "Classes held",
    "Classes attended",
    "Attendance %",
    "Assignments submitted",
    "Assignments graded",
    "Assignment average %",
    "Quizzes attempted",
    "Quiz average %",
    "Quiz best %",
    "Certificate",
  ];
  const rows = card.courses.map((c) => [
    learner.name,
    learner.email,
    learner.phone ?? "",
    c.courseTitle,
    c.batchName ?? "",
    c.status,
    c.enrolledAt.slice(0, 10),
    c.lessonsCompleted,
    c.lessonsTotal,
    c.progressPercent,
    c.classesHeld,
    c.classesAttended,
    c.attendancePercent ?? "",
    c.assignmentsSubmitted,
    c.assignmentsGraded,
    c.assignmentAvgPercent ?? "",
    c.quizzesTaken,
    c.quizAvgPercent ?? "",
    c.quizBestPercent ?? "",
    c.certificateSerial ?? "",
  ]);
  return { headers, rows };
}
