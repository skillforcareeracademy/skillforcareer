import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import type { BatchSchedule } from "@/lib/validations/batch";
import { listBatchNotes, type BatchNoteRow } from "./batch-note-service";

/**
 * The batch profile: "batch attendance option (average attendance of batch,
 * student wise attendance, batch performance, no. of classes completed, list of
 * missed classes, notes assigned to batch, quiz and tests assigned to batch,
 * similar course batches…)".
 *
 * One read model, built from rows the platform already keeps — nothing is
 * denormalised onto the batch, so it can't drift. Two waves of queries whatever
 * the batch size: everything keyed by the batch id, then everything that needs
 * its course. Per-learner numbers are folded together in memory rather than
 * asked for learner by learner.
 *
 * Attendance follows the learner-side rule (student-attendance-service): it is
 * measured against classes whose register was actually taken. A class that
 * ended with no attendance marked at all shows as "register not taken" instead
 * of silently counting as everyone's absence.
 */

const PRESENT = new Set(["PRESENT", "LATE", "LEFT_EARLY"]);
const HOUR = 3_600_000;

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

const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : null;
const mean = (xs: number[]) =>
  xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null;

export interface BatchPerson {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

/** Where a class stands, from the batch's point of view. */
export type ClassPhase =
  "completed" | "live" | "upcoming" | "not_held" | "cancelled";

export interface BatchProfileClass {
  id: string;
  title: string;
  status: string;
  phase: ClassPhase;
  scheduledStart: string;
  scheduledEnd: string | null;
  location: string | null;
  hostName: string | null;
  cancelReason: string | null;
  /** True once any attendance is marked for this class. */
  registerTaken: boolean;
  /** Learners on the roster who were marked present (or late / left early). */
  presentCount: number;
  /** Learners on the roster who were expected — on the batch by then. */
  expectedCount: number;
}

export interface BatchProfileLearner {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  enrollmentStatus: string;
  progress: number;
  enrolledAt: string;
  lastSeenAt: string | null;
  /** Classes (with a register) this learner was present for. */
  attended: number;
  /** Classes (with a register) this learner was expected at but not present for. */
  missed: number;
  attendancePercent: number | null;
  attendedClassIds: string[];
  missedClassIds: string[];
  quizAverage: number | null;
  quizzesTaken: number;
  assignmentsSubmitted: number;
}

/** "batch": set for this batch. "course": set for nobody in particular, so the whole course sees it. */
export type AssessmentScope = "batch" | "course";

export interface BatchProfileQuiz {
  id: string;
  title: string;
  isPublished: boolean;
  releaseAt: string | null;
  passingScore: number;
  scope: AssessmentScope;
  /** Other batches this quiz is also set for. */
  otherBatches: number;
  /** Learners named on it individually. */
  individuals: number;
  attempted: number;
  passed: number;
  averageScore: number | null;
}

export interface BatchProfileAssignment {
  id: string;
  title: string;
  dueDate: string | null;
  releaseAt: string | null;
  maxScore: number;
  scope: AssessmentScope;
  otherBatches: number;
  individuals: number;
  submitted: number;
  graded: number;
  averageScore: number | null;
}

/** A quiz or assignment of the course that isn't set for this batch yet. */
export interface AssignableItem {
  id: string;
  title: string;
  /** Currently open to the whole course — setting it for this batch narrows it. */
  courseWide: boolean;
  isPublished: boolean;
}

export interface SimilarBatch {
  id: string;
  name: string;
  code: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  capacity: number | null;
  learners: number;
  instructorName: string | null;
  associateNames: string[];
  /** Whether the viewer may open that batch's profile. */
  canOpen: boolean;
}

export interface BatchKpis {
  learners: number;
  completedLearners: number;
  averageAttendance: number | null;
  averageProgress: number | null;
  averageQuizScore: number | null;
  /** Share of (learner × released assignment) pairs that have a submission. */
  assignmentSubmissionRate: number | null;
  classes: {
    total: number;
    completed: number;
    live: number;
    upcoming: number;
    notHeld: number;
    cancelled: number;
    /** Completed classes nobody took the register for. */
    unmarked: number;
  };
}

export interface BatchProfile {
  id: string;
  name: string;
  code: string;
  status: string;
  capacity: number | null;
  startDate: string | null;
  endDate: string | null;
  schedule: BatchSchedule | null;
  course: { id: string; title: string; slug: string };
  instructor: BatchPerson | null;
  associates: BatchPerson[];
  kpis: BatchKpis;
  learners: BatchProfileLearner[];
  classes: BatchProfileClass[];
  quizzes: BatchProfileQuiz[];
  assignments: BatchProfileAssignment[];
  assignableQuizzes: AssignableItem[];
  assignableAssignments: AssignableItem[];
  notes: BatchNoteRow[];
  similar: SimilarBatch[];
}

export async function getBatchProfile(
  batchId: string,
  viewer: { id: string; isStaff: boolean },
): Promise<BatchProfile> {
  // ── Wave 1: everything keyed by the batch ─────────────────────────────────
  const [batch, associates, roster, meetings, attendance, notes] =
    await Promise.all([
      prisma.batch.findUnique({
        where: { id: batchId },
        select: {
          id: true,
          name: true,
          code: true,
          status: true,
          capacity: true,
          startDate: true,
          endDate: true,
          schedule: true,
          courseId: true,
          course: { select: { id: true, title: true, slug: true } },
          instructor: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      }),
      prisma.batchInstructor.findMany({
        where: { batchId },
        orderBy: { createdAt: "asc" },
        select: {
          user: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      }),
      prisma.enrollment.findMany({
        where: { batchId },
        select: {
          userId: true,
          status: true,
          progressPercent: true,
          enrolledAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              avatarUrl: true,
              lastLoginAt: true,
            },
          },
        },
      }),
      prisma.meeting.findMany({
        where: { batchId },
        orderBy: { scheduledStart: "asc" },
        take: 500,
        select: {
          id: true,
          title: true,
          status: true,
          scheduledStart: true,
          scheduledEnd: true,
          location: true,
          cancelReason: true,
          host: { select: { name: true } },
        },
      }),
      prisma.attendance.findMany({
        where: { meeting: { batchId } },
        select: { meetingId: true, userId: true, status: true },
      }),
      listBatchNotes(batchId),
    ]);
  if (!batch) throw AppError.notFound("Batch not found.");

  const courseId = batch.courseId;
  const rosterIds = roster.map((r) => r.userId);
  const onBatch = new Set(rosterIds);

  // What this batch can see: its own course's quizzes/assignments, plus any it
  // was set for directly.
  const quizScope: Prisma.QuizWhereInput = {
    OR: [{ courseId }, { batches: { some: { batchId } } }],
  };
  const assignmentScope: Prisma.AssignmentWhereInput = {
    OR: [{ courseId }, { batches: { some: { batchId } } }],
  };

  // ── Wave 2: everything that needs the course or the roster ────────────────
  const [quizzes, assignments, attempts, submissions, siblings] =
    await Promise.all([
      prisma.quiz.findMany({
        where: quizScope,
        orderBy: { createdAt: "desc" },
        take: 300,
        select: {
          id: true,
          title: true,
          isPublished: true,
          releaseAt: true,
          passingScore: true,
          batches: { select: { batchId: true } },
          _count: { select: { students: true } },
        },
      }),
      prisma.assignment.findMany({
        where: assignmentScope,
        orderBy: { createdAt: "desc" },
        take: 300,
        select: {
          id: true,
          title: true,
          dueDate: true,
          releaseAt: true,
          maxScore: true,
          batches: { select: { batchId: true } },
          _count: { select: { students: true } },
        },
      }),
      rosterIds.length
        ? prisma.quizAttempt.findMany({
            where: {
              studentId: { in: rosterIds },
              status: { in: ["SUBMITTED", "GRADED"] },
              quiz: quizScope,
            },
            select: {
              quizId: true,
              studentId: true,
              score: true,
              maxScore: true,
            },
          })
        : Promise.resolve([]),
      rosterIds.length
        ? prisma.assignmentSubmission.findMany({
            where: {
              studentId: { in: rosterIds },
              status: { not: "DRAFT" },
              assignment: assignmentScope,
            },
            select: {
              assignmentId: true,
              studentId: true,
              status: true,
              score: true,
            },
          })
        : Promise.resolve([]),
      prisma.batch.findMany({
        where: { courseId, id: { not: batchId } },
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        take: 30,
        select: {
          id: true,
          name: true,
          code: true,
          status: true,
          startDate: true,
          endDate: true,
          capacity: true,
          enrolledCount: true,
          instructorId: true,
          instructor: { select: { name: true } },
          associates: {
            select: { userId: true, user: { select: { name: true } } },
          },
          _count: { select: { enrollments: true } },
        },
      }),
    ]);

  const now = Date.now();

  // ── Classes & attendance ──────────────────────────────────────────────────
  const marksByMeeting = new Map<string, Map<string, string>>();
  for (const a of attendance) {
    if (!a.meetingId) continue;
    let m = marksByMeeting.get(a.meetingId);
    if (!m) marksByMeeting.set(a.meetingId, (m = new Map()));
    m.set(a.userId, a.status);
  }

  const enrolledAt = new Map(
    roster.map((r) => [r.userId, r.enrolledAt.getTime()]),
  );
  /**
   * Was this learner expected at a class? Yes if they were enrolled by the time
   * it ended — a learner added this week can't have missed last month's class —
   * or if someone marked them for it anyway.
   */
  const expectedAt = (
    userId: string,
    classEnd: number,
    marks: Map<string, string> | undefined,
  ) =>
    (enrolledAt.get(userId) ?? Infinity) <= classEnd ||
    Boolean(marks?.has(userId));

  const perLearner = new Map(
    rosterIds.map((id) => [
      id,
      {
        attended: 0,
        missed: 0,
        attendedClassIds: [] as string[],
        missedClassIds: [] as string[],
      },
    ]),
  );

  const classes: BatchProfileClass[] = meetings.map((m) => {
    const start = m.scheduledStart.getTime();
    const end = m.scheduledEnd?.getTime() ?? start + HOUR;
    const phase: ClassPhase =
      m.status === "ENDED"
        ? "completed"
        : m.status === "LIVE"
          ? "live"
          : m.status === "CANCELLED"
            ? "cancelled"
            : end < now
              ? "not_held"
              : "upcoming";

    const marks = marksByMeeting.get(m.id);
    const registerTaken = Boolean(marks && marks.size > 0);
    let presentCount = 0;
    let expectedCount = 0;

    if (phase === "completed") {
      for (const userId of rosterIds) {
        const present = PRESENT.has(marks?.get(userId) ?? "");
        if (present) presentCount += 1;
        if (!registerTaken || !expectedAt(userId, end, marks)) continue;
        expectedCount += 1;
        const row = perLearner.get(userId)!;
        if (present) {
          row.attended += 1;
          row.attendedClassIds.push(m.id);
        } else {
          row.missed += 1;
          row.missedClassIds.push(m.id);
        }
      }
    }

    return {
      id: m.id,
      title: m.title,
      status: m.status,
      phase,
      scheduledStart: m.scheduledStart.toISOString(),
      scheduledEnd: m.scheduledEnd?.toISOString() ?? null,
      location: m.location,
      hostName: m.host?.name ?? null,
      cancelReason: m.cancelReason,
      registerTaken,
      presentCount,
      expectedCount,
    };
  });

  // ── Quizzes ───────────────────────────────────────────────────────────────
  /** Best percentage per (quiz, learner) — a retake shouldn't count twice. */
  const bestQuiz = new Map<string, Map<string, number>>();
  for (const a of attempts) {
    if (a.score == null || a.maxScore <= 0) continue;
    const p = (a.score / a.maxScore) * 100;
    let byUser = bestQuiz.get(a.quizId);
    if (!byUser) bestQuiz.set(a.quizId, (byUser = new Map()));
    byUser.set(a.studentId, Math.max(byUser.get(a.studentId) ?? 0, p));
  }

  const scopeOf = (row: {
    batches: { batchId: string }[];
    _count: { students: number };
  }) =>
    row.batches.some((b) => b.batchId === batchId)
      ? ("batch" as const)
      : row.batches.length === 0 && row._count.students === 0
        ? ("course" as const)
        : null;

  const visibleQuizzes: BatchProfileQuiz[] = [];
  const assignableQuizzes: AssignableItem[] = [];
  for (const q of quizzes) {
    const scope = scopeOf(q);
    if (scope !== "batch") {
      // Only the course's own quizzes can be set here; a quiz reaching this
      // batch from elsewhere is always scoped "batch" above.
      assignableQuizzes.push({
        id: q.id,
        title: q.title,
        courseWide: scope === "course",
        isPublished: q.isPublished,
      });
    }
    if (!scope) continue;
    const scores = [...(bestQuiz.get(q.id)?.values() ?? [])];
    visibleQuizzes.push({
      id: q.id,
      title: q.title,
      isPublished: q.isPublished,
      releaseAt: q.releaseAt?.toISOString() ?? null,
      passingScore: q.passingScore,
      scope,
      otherBatches: q.batches.filter((b) => b.batchId !== batchId).length,
      individuals: q._count.students,
      attempted: scores.length,
      passed: scores.filter((s) => s >= q.passingScore).length,
      averageScore: mean(scores),
    });
  }
  const visibleQuizIds = new Set(visibleQuizzes.map((q) => q.id));

  // ── Assignments ───────────────────────────────────────────────────────────
  const subsByAssignment = new Map<string, typeof submissions>();
  for (const s of submissions) {
    const list = subsByAssignment.get(s.assignmentId) ?? [];
    list.push(s);
    subsByAssignment.set(s.assignmentId, list);
  }

  const visibleAssignments: BatchProfileAssignment[] = [];
  const assignableAssignments: AssignableItem[] = [];
  for (const a of assignments) {
    const scope = scopeOf(a);
    if (scope !== "batch") {
      assignableAssignments.push({
        id: a.id,
        title: a.title,
        courseWide: scope === "course",
        isPublished: true,
      });
    }
    if (!scope) continue;
    const subs = subsByAssignment.get(a.id) ?? [];
    const learners = new Set(subs.map((s) => s.studentId));
    const graded = subs.filter((s) => s.status === "GRADED" && s.score != null);
    visibleAssignments.push({
      id: a.id,
      title: a.title,
      dueDate: a.dueDate?.toISOString() ?? null,
      releaseAt: a.releaseAt?.toISOString() ?? null,
      maxScore: a.maxScore,
      scope,
      otherBatches: a.batches.filter((b) => b.batchId !== batchId).length,
      individuals: a._count.students,
      submitted: learners.size,
      graded: new Set(graded.map((s) => s.studentId)).size,
      averageScore:
        a.maxScore > 0
          ? mean(graded.map((s) => ((s.score ?? 0) / a.maxScore) * 100))
          : null,
    });
  }
  const visibleAssignmentIds = new Set(visibleAssignments.map((a) => a.id));

  // Assignments already released count toward the submission rate; one still
  // hidden from learners can't have been handed in yet.
  const releasedAssignments = visibleAssignments.filter(
    (a) => !a.releaseAt || new Date(a.releaseAt).getTime() <= now,
  );
  const releasedIds = new Set(releasedAssignments.map((a) => a.id));
  const submittedPairs = new Set(
    submissions
      .filter(
        (s) => releasedIds.has(s.assignmentId) && onBatch.has(s.studentId),
      )
      .map((s) => `${s.assignmentId}:${s.studentId}`),
  ).size;

  // ── Learners ──────────────────────────────────────────────────────────────
  const learnerQuiz = new Map<string, number[]>();
  for (const [quizId, byUser] of bestQuiz) {
    if (!visibleQuizIds.has(quizId)) continue;
    for (const [userId, p] of byUser) {
      const list = learnerQuiz.get(userId) ?? [];
      list.push(p);
      learnerQuiz.set(userId, list);
    }
  }
  const learnerSubs = new Map<string, Set<string>>();
  for (const s of submissions) {
    if (!visibleAssignmentIds.has(s.assignmentId)) continue;
    const set = learnerSubs.get(s.studentId) ?? new Set<string>();
    set.add(s.assignmentId);
    learnerSubs.set(s.studentId, set);
  }

  const learners: BatchProfileLearner[] = roster
    .map((r) => {
      const a = perLearner.get(r.userId)!;
      const quizScores = learnerQuiz.get(r.userId) ?? [];
      return {
        userId: r.userId,
        name: r.user.name,
        email: r.user.email,
        phone: r.user.phone,
        avatarUrl: r.user.avatarUrl,
        enrollmentStatus: r.status,
        progress: Math.round(r.progressPercent),
        enrolledAt: r.enrolledAt.toISOString(),
        lastSeenAt: r.user.lastLoginAt?.toISOString() ?? null,
        attended: a.attended,
        missed: a.missed,
        attendancePercent: pct(a.attended, a.attended + a.missed),
        attendedClassIds: a.attendedClassIds,
        missedClassIds: a.missedClassIds,
        quizAverage: mean(quizScores),
        quizzesTaken: quizScores.length,
        assignmentsSubmitted: learnerSubs.get(r.userId)?.size ?? 0,
      };
    })
    .sort((x, y) => x.name.localeCompare(y.name));

  // ── Headline numbers ──────────────────────────────────────────────────────
  const attendedTotal = learners.reduce((s, l) => s + l.attended, 0);
  const expectedTotal = learners.reduce((s, l) => s + l.attended + l.missed, 0);
  const allQuizScores = [...learnerQuiz.values()].flat();

  const count = (phase: ClassPhase) =>
    classes.filter((c) => c.phase === phase).length;
  const kpis: BatchKpis = {
    learners: learners.length,
    completedLearners: roster.filter(
      (r) => r.status === "COMPLETED" || r.progressPercent >= 100,
    ).length,
    // Pooled over every learner-class pair, so a learner who joined late
    // weighs by the classes they were actually expected at.
    averageAttendance: pct(attendedTotal, expectedTotal),
    averageProgress: mean(roster.map((r) => r.progressPercent)),
    averageQuizScore: mean(allQuizScores),
    assignmentSubmissionRate: pct(
      submittedPairs,
      releasedAssignments.length * learners.length,
    ),
    classes: {
      total: classes.length,
      completed: count("completed"),
      live: count("live"),
      upcoming: count("upcoming"),
      notHeld: count("not_held"),
      cancelled: count("cancelled"),
      unmarked: classes.filter(
        (c) => c.phase === "completed" && !c.registerTaken,
      ).length,
    },
  };

  const person = (u: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  }) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    avatarUrl: u.avatarUrl,
  });

  return {
    id: batch.id,
    name: batch.name,
    code: batch.code,
    status: batch.status,
    capacity: batch.capacity,
    startDate: batch.startDate?.toISOString() ?? null,
    endDate: batch.endDate?.toISOString() ?? null,
    schedule: parseSchedule(batch.schedule),
    course: batch.course,
    instructor: batch.instructor ? person(batch.instructor) : null,
    associates: associates.map((a) => person(a.user)),
    kpis,
    learners,
    classes,
    quizzes: visibleQuizzes,
    assignments: visibleAssignments,
    assignableQuizzes,
    assignableAssignments,
    notes,
    similar: siblings.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      status: s.status,
      startDate: s.startDate?.toISOString() ?? null,
      endDate: s.endDate?.toISOString() ?? null,
      capacity: s.capacity,
      // Same figure the batches list shows for it.
      learners: s.enrolledCount || s._count.enrollments,
      instructorName: s.instructor?.name ?? null,
      associateNames: s.associates.map((a) => a.user.name),
      canOpen:
        viewer.isStaff ||
        s.instructorId === viewer.id ||
        s.associates.some((a) => a.userId === viewer.id),
    })),
  };
}
