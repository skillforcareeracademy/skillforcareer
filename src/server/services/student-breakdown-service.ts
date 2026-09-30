import { prisma } from "@/lib/prisma";
import { getStudentAttendance } from "./student-attendance-service";

/**
 * The detail behind a learner's figures.
 *
 * "These data cards like attendance, quiz, and all should be clickable to see
 * exactly on which days classes they attended or not. Similar which quiz they
 * have completed and which are pending, which assignment they have completed,
 * how many lectures or study material watched and read and for how long."
 *
 * So each card opens the list it is a count of. The scorecard already totals
 * these; this is the same ground at one row per thing.
 */

export interface BreakdownRow {
  id: string;
  title: string;
  subtitle: string | null;
  /** done / pending / missed — what colours the row. */
  state: "done" | "pending" | "missed" | "none";
  /** The number that matters for this kind of row. */
  value: string | null;
}

export interface StudentBreakdown {
  attendance: BreakdownRow[];
  quizzes: BreakdownRow[];
  assignments: BreakdownRow[];
  lessons: BreakdownRow[];
  materials: BreakdownRow[];
}

const minutes = (seconds: number) => {
  if (seconds <= 0) return "—";
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export async function studentBreakdown(userId: string): Promise<StudentBreakdown> {
  const enrolments = await prisma.enrollment.findMany({
    where: { userId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { courseId: true, batchId: true },
  });
  const courseIds = [...new Set(enrolments.map((e) => e.courseId))];
  const batchIds = [...new Set(enrolments.map((e) => e.batchId).filter((b): b is string => !!b))];

  const [register, quizzes, attempts, assignments, submissions, lessons, progress, materials, reads] =
    await Promise.all([
      getStudentAttendance(userId),
      courseIds.length
        ? prisma.quiz.findMany({
            where: { isPublished: true, courseId: { in: courseIds } },
            orderBy: [{ sequence: "asc" }, { title: "asc" }],
            take: 500,
            select: { id: true, title: true, course: { select: { title: true } } },
          })
        : [],
      prisma.quizAttempt.findMany({
        where: { studentId: userId, status: { in: ["SUBMITTED", "GRADED"] } },
        select: { quizId: true, score: true, maxScore: true, submittedAt: true },
      }),
      courseIds.length
        ? prisma.assignment.findMany({
            where: { courseId: { in: courseIds } },
            orderBy: { createdAt: "desc" },
            take: 500,
            select: { id: true, title: true, maxScore: true, dueDate: true },
          })
        : [],
      prisma.assignmentSubmission.findMany({
        where: { studentId: userId },
        select: { assignmentId: true, status: true, score: true, submittedAt: true },
      }),
      courseIds.length
        ? prisma.lesson.findMany({
            where: { chapter: { courseId: { in: courseIds } } },
            orderBy: [{ chapter: { order: "asc" } }, { order: "asc" }],
            take: 1000,
            select: {
              id: true,
              title: true,
              durationSeconds: true,
              chapter: { select: { title: true } },
            },
          })
        : [],
      prisma.lessonProgress.findMany({
        where: { userId },
        select: { lessonId: true, completed: true, watchedSeconds: true },
      }),
      prisma.studyMaterial.findMany({
        where: {
          isPublished: true,
          OR: [
            ...(courseIds.length ? [{ courseId: { in: courseIds } }] : []),
            ...(batchIds.length ? [{ batches: { some: { batchId: { in: batchIds } } } }] : []),
            { students: { some: { userId } } },
          ],
        },
        orderBy: [{ sequence: "asc" }, { title: "asc" }],
        take: 500,
        select: { id: true, title: true, course: { select: { title: true } } },
      }),
      prisma.materialRead.findMany({
        where: { userId },
        select: { materialId: true, seconds: true, opens: true, lastReadAt: true },
      }),
    ]);

  const attemptBy = new Map<string, { best: number | null; at: Date | null }>();
  for (const a of attempts) {
    const pct = a.maxScore > 0 ? Math.round(((a.score ?? 0) * 100) / a.maxScore) : null;
    const current = attemptBy.get(a.quizId);
    if (!current || (pct ?? -1) > (current.best ?? -1)) {
      attemptBy.set(a.quizId, { best: pct, at: a.submittedAt });
    }
  }
  const submissionBy = new Map(submissions.map((s) => [s.assignmentId, s]));
  const progressBy = new Map(progress.map((p) => [p.lessonId, p]));
  const readBy = new Map(reads.map((r) => [r.materialId, r]));

  return {
    // Every class their cohort held, and whether they were there.
    attendance: register.entries.map((e) => ({
      id: e.id,
      title: e.title,
      subtitle: `${day(e.scheduledAt)}${e.batchName ? ` · ${e.batchName}` : ""}`,
      state:
        e.status === "PRESENT" || e.status === "LATE" || e.status === "LEFT_EARLY"
          ? "done"
          : e.status === "ABSENT"
            ? "missed"
            : "none",
      value: e.durationSeconds > 0 ? minutes(e.durationSeconds) : null,
    })),

    quizzes: quizzes.map((q) => {
      const done = attemptBy.get(q.id);
      return {
        id: q.id,
        title: q.title,
        subtitle: done?.at
          ? `${q.course?.title ?? "Quiz"} · taken ${day(done.at.toISOString())}`
          : (q.course?.title ?? "Not attempted yet"),
        state: done ? "done" : "pending",
        value: done?.best == null ? null : `${done.best}%`,
      };
    }),

    assignments: assignments.map((a) => {
      const s = submissionBy.get(a.id);
      return {
        id: a.id,
        title: a.title,
        subtitle: s?.submittedAt
          ? `Handed in ${day(s.submittedAt.toISOString())}`
          : a.dueDate
            ? `Due ${day(a.dueDate.toISOString())}`
            : "No due date",
        state: s && s.status !== "DRAFT" ? "done" : "pending",
        value: s?.score == null ? null : `${s.score}/${a.maxScore}`,
      };
    }),

    lessons: lessons.map((l) => {
      const p = progressBy.get(l.id);
      return {
        id: l.id,
        title: l.title,
        subtitle: l.chapter.title,
        state: p?.completed ? "done" : p?.watchedSeconds ? "pending" : "none",
        value: p?.watchedSeconds ? minutes(p.watchedSeconds) : null,
      };
    }),

    materials: materials.map((m) => {
      const r = readBy.get(m.id);
      return {
        id: m.id,
        title: m.title,
        subtitle: r?.lastReadAt
          ? `Last opened ${day(r.lastReadAt.toISOString())} · ${r.opens} time${r.opens === 1 ? "" : "s"}`
          : (m.course?.title ?? "Not opened yet"),
        state: r ? "done" : "pending",
        value: r?.seconds ? minutes(r.seconds) : null,
      };
    }),
  };
}
