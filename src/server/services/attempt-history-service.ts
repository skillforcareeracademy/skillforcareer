import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { ROLES } from "@/config/roles";

/**
 * Every attempt a learner has made, and exactly what happened in each one.
 *
 * "Student should see the result of every attempt they take even after later.
 * Admin, student and instructor can see how many attempt they took and what
 * score they got and more data in detail like list of questions they got wrong
 * and right or unanswered."
 *
 * All three panels read the same two functions, so a learner looking at their
 * own paper and an instructor looking at the same paper are shown the same
 * record — only the answer key is held back where the quiz says to.
 */

export type AnswerState = "CORRECT" | "WRONG" | "UNANSWERED" | "AWAITING";

export interface AttemptSummary {
  id: string;
  attemptNo: number;
  status: string;
  score: number | null;
  maxScore: number;
  percent: number;
  passed: boolean;
  correct: number;
  wrong: number;
  unanswered: number;
  /** Written answers an instructor has still to mark. */
  awaiting: number;
  timeSpentSeconds: number;
  startedAt: string;
  submittedAt: string | null;
  studentId: string;
  studentName: string;
}

export interface AttemptQuestion {
  questionId: string;
  number: number;
  text: string;
  type: string;
  points: number;
  pointsAwarded: number;
  state: AnswerState;
  yourAnswer: string;
  /** Blank when the paper is set not to show its key. */
  correctAnswer: string;
  explanation: string | null;
}

export interface AttemptDetail extends AttemptSummary {
  quizId: string;
  quizTitle: string;
  passingScore: number;
  showAnswers: boolean;
  questions: AttemptQuestion[];
}

export interface Viewer {
  id: string;
  roles: string[];
}

const isStaff = (v: Viewer) =>
  v.roles.some(
    (r) => r === ROLES.SUPER_ADMIN || r === ROLES.ADMIN || r === ROLES.INSTRUCTOR,
  );

/** The option ids a learner picked, however the JSON column came back. */
function picked(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Option ids → the words the learner actually saw. */
function wordsFor(options: { id: string; text: string }[], ids: string[]): string {
  const byId = new Map(options.map((o) => [o.id, o.text]));
  return ids.map((id) => byId.get(id) ?? "").filter(Boolean).join(", ");
}

/**
 * Every attempt on a quiz. A learner may only ask about their own; staff and
 * instructors may ask about anyone's, which is what the admin and instructor
 * panels do.
 */
export async function listQuizAttempts(
  quizId: string,
  studentId: string,
  viewer: Viewer,
): Promise<AttemptSummary[]> {
  if (studentId !== viewer.id && !isStaff(viewer)) {
    throw AppError.forbidden("You can only see your own attempts.");
  }

  const attempts = await prisma.quizAttempt.findMany({
    where: { quizId, studentId },
    orderBy: { attemptNo: "asc" },
    select: {
      id: true,
      attemptNo: true,
      status: true,
      score: true,
      maxScore: true,
      timeSpentSeconds: true,
      startedAt: true,
      submittedAt: true,
      studentId: true,
      student: { select: { name: true } },
      responses: { select: { isCorrect: true, selectedOptions: true, answerText: true } },
    },
  });

  // How many questions the paper holds, so "unanswered" counts the ones that
  // were never reached rather than only the ones with an empty response row.
  const total = await prisma.question.count({ where: { quizId } });

  return attempts.map((a) => summarise(a, total));
}

type AttemptRow = {
  id: string;
  attemptNo: number;
  status: string;
  score: number | null;
  maxScore: number;
  timeSpentSeconds: number;
  startedAt: Date;
  submittedAt: Date | null;
  studentId: string;
  student: { name: string };
  responses: { isCorrect: boolean | null; selectedOptions: unknown; answerText: string | null }[];
};

function summarise(a: AttemptRow, totalQuestions: number): AttemptSummary {
  let correct = 0;
  let wrong = 0;
  let awaiting = 0;
  let answered = 0;

  for (const r of a.responses) {
    const gave = picked(r.selectedOptions).length > 0 || Boolean(r.answerText?.trim());
    if (gave) answered += 1;
    // Left blank is unanswered, not "being marked" and not wrong.
    if (r.isCorrect === null) {
      if (gave) awaiting += 1;
    } else if (r.isCorrect) correct += 1;
    else if (gave) wrong += 1;
  }

  const max = a.maxScore || 0;
  const score = a.score ?? 0;
  return {
    id: a.id,
    attemptNo: a.attemptNo,
    status: a.status,
    score: a.score,
    maxScore: max,
    percent: max > 0 ? Math.round((score / max) * 100) : 0,
    passed: false, // filled in by the caller, which knows the pass mark
    correct,
    wrong,
    unanswered: Math.max(0, totalQuestions - answered),
    awaiting,
    timeSpentSeconds: a.timeSpentSeconds,
    startedAt: a.startedAt.toISOString(),
    submittedAt: a.submittedAt ? a.submittedAt.toISOString() : null,
    studentId: a.studentId,
    studentName: a.student.name,
  };
}

/**
 * One attempt, question by question: what was asked, what they put, what was
 * right, and whether it was left blank.
 *
 * The key is withheld when the quiz is set not to show answers — a learner
 * reading back an old attempt must not see more than the quiz allows. Staff
 * always see it, because marking is their job.
 */
export async function quizAttemptDetail(
  attemptId: string,
  viewer: Viewer,
): Promise<AttemptDetail> {
  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      attemptNo: true,
      status: true,
      score: true,
      maxScore: true,
      timeSpentSeconds: true,
      startedAt: true,
      submittedAt: true,
      studentId: true,
      student: { select: { name: true } },
      quiz: {
        select: {
          id: true,
          title: true,
          passingScore: true,
          showAnswers: true,
          questions: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              text: true,
              type: true,
              points: true,
              explanation: true,
              correctAnswer: true,
              options: { orderBy: { order: "asc" }, select: { id: true, text: true, isCorrect: true } },
            },
          },
        },
      },
      responses: {
        select: {
          questionId: true,
          selectedOptions: true,
          answerText: true,
          isCorrect: true,
          pointsAwarded: true,
        },
      },
    },
  });
  if (!attempt) throw AppError.notFound("That attempt no longer exists.");

  const staff = isStaff(viewer);
  if (attempt.studentId !== viewer.id && !staff) {
    throw AppError.forbidden("You can only see your own attempts.");
  }

  const byQuestion = new Map(attempt.responses.map((r) => [r.questionId, r]));
  const showKey = staff || attempt.quiz.showAnswers;

  const questions: AttemptQuestion[] = attempt.quiz.questions.map((q, i) => {
    const r = byQuestion.get(q.id);
    const chosen = picked(r?.selectedOptions);
    const typed = r?.answerText?.trim() ?? "";
    const gave = chosen.length > 0 || typed.length > 0;

    const state: AnswerState = !gave
      ? "UNANSWERED"
      : r?.isCorrect === null || r?.isCorrect === undefined
        ? "AWAITING"
        : r.isCorrect
          ? "CORRECT"
          : "WRONG";

    const key =
      q.type === "SHORT_ANSWER"
        ? (q.correctAnswer ?? "")
        : wordsFor(q.options, q.options.filter((o) => o.isCorrect).map((o) => o.id));

    return {
      questionId: q.id,
      number: i + 1,
      text: q.text,
      type: q.type,
      points: q.points,
      pointsAwarded: r?.pointsAwarded ?? 0,
      state,
      yourAnswer: typed || wordsFor(q.options, chosen) || "",
      correctAnswer: showKey ? key : "",
      explanation: showKey ? q.explanation : null,
    };
  });

  const summary = summarise(
    { ...attempt, responses: attempt.responses },
    attempt.quiz.questions.length,
  );

  return {
    ...summary,
    passed: summary.percent >= attempt.quiz.passingScore,
    quizId: attempt.quiz.id,
    quizTitle: attempt.quiz.title,
    passingScore: attempt.quiz.passingScore,
    showAnswers: showKey,
    questions,
  };
}

/** The pass mark, so a list of attempts can say which ones passed. */
export async function listQuizAttemptsWithPass(
  quizId: string,
  studentId: string,
  viewer: Viewer,
): Promise<{ attempts: AttemptSummary[]; passingScore: number; quizTitle: string }> {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { title: true, passingScore: true },
  });
  if (!quiz) throw AppError.notFound("Quiz not found.");

  const attempts = await listQuizAttempts(quizId, studentId, viewer);
  return {
    attempts: attempts.map((a) => ({ ...a, passed: a.percent >= quiz.passingScore })),
    passingScore: quiz.passingScore,
    quizTitle: quiz.title,
  };
}

// ── Assignments ──────────────────────────────────────────────────────────────

/**
 * The same record for an assignment — "similarly in assignments".
 *
 * Assignments keep one live submission row that grading reads and overwrites,
 * so the history comes from the snapshot written at each submission. A paper
 * submitted before snapshots existed still shows its live row, which is why the
 * current submission is folded in rather than read from the log alone.
 */
export async function listAssignmentAttempts(
  assignmentId: string,
  studentId: string,
  viewer: Viewer,
): Promise<{ attempts: AttemptSummary[]; title: string }> {
  if (studentId !== viewer.id && !isStaff(viewer)) {
    throw AppError.forbidden("You can only see your own attempts.");
  }

  const [assignment, log, student] = await Promise.all([
    prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { title: true, maxScore: true, _count: { select: { questions: true } } },
    }),
    prisma.assignmentAttempt.findMany({
      where: { assignmentId, studentId },
      orderBy: { attemptNo: "asc" },
    }),
    prisma.user.findUnique({ where: { id: studentId }, select: { name: true } }),
  ]);
  if (!assignment) throw AppError.notFound("Assignment not found.");

  const total = assignment._count.questions;
  const attempts = log.map((a) => {
    const rows = answerRows(a.answers);
    const gave = (r: AnswerRow) => r.optionIds.length > 0 || r.text.trim().length > 0;
    const correct = rows.filter((r) => r.isCorrect === true).length;
    // A question left blank is unanswered, not wrong — the marking records it
    // as not-correct either way, so the two have to be told apart here.
    const wrong = rows.filter((r) => r.isCorrect === false && gave(r)).length;
    const awaiting = rows.filter((r) => r.isCorrect === null && gave(r)).length;
    const answered = rows.filter(gave).length;
    const max = a.maxScore || assignment.maxScore || 0;
    const score = a.score ?? a.autoScore ?? 0;
    return {
      id: a.id,
      attemptNo: a.attemptNo,
      status: a.needsMarking ? "SUBMITTED" : "GRADED",
      score: a.score ?? a.autoScore,
      maxScore: max,
      percent: max > 0 ? Math.round((score / max) * 100) : 0,
      passed: false,
      correct,
      wrong,
      unanswered: Math.max(0, total - answered),
      awaiting,
      timeSpentSeconds: 0,
      startedAt: a.submittedAt.toISOString(),
      submittedAt: a.submittedAt.toISOString(),
      studentId,
      studentName: student?.name ?? "",
    } satisfies AttemptSummary;
  });

  return { attempts, title: assignment.title };
}

interface AnswerRow {
  questionId: string;
  optionIds: string[];
  text: string;
  isCorrect: boolean | null;
  points: number;
}

/** The answers column, however the JSON came back. */
function answerRows(value: unknown): AnswerRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    return {
      questionId: typeof r.questionId === "string" ? r.questionId : "",
      optionIds: picked(r.optionIds),
      text: typeof r.text === "string" ? r.text : "",
      isCorrect: typeof r.isCorrect === "boolean" ? r.isCorrect : null,
      points: typeof r.points === "number" ? r.points : 0,
    };
  });
}

/** One assignment attempt, question by question. */
export async function assignmentAttemptDetail(
  attemptId: string,
  viewer: Viewer,
): Promise<AttemptDetail> {
  const attempt = await prisma.assignmentAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      attemptNo: true,
      answers: true,
      autoScore: true,
      score: true,
      maxScore: true,
      needsMarking: true,
      submittedAt: true,
      studentId: true,
      student: { select: { name: true } },
      assignment: {
        select: {
          id: true,
          title: true,
          maxScore: true,
          questions: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              text: true,
              type: true,
              points: true,
              explanation: true,
              correctAnswer: true,
              options: {
                orderBy: { order: "asc" },
                select: { id: true, text: true, isCorrect: true },
              },
            },
          },
        },
      },
    },
  });
  if (!attempt) throw AppError.notFound("That attempt no longer exists.");

  const staff = isStaff(viewer);
  if (attempt.studentId !== viewer.id && !staff) {
    throw AppError.forbidden("You can only see your own attempts.");
  }

  const given = new Map(answerRows(attempt.answers).map((r) => [r.questionId, r]));
  const questions: AttemptQuestion[] = attempt.assignment.questions.map((q, i) => {
    const r = given.get(q.id);
    const chosen = r?.optionIds ?? [];
    const typed = r?.text?.trim() ?? "";
    const gave = chosen.length > 0 || typed.length > 0;
    const state: AnswerState = !gave
      ? "UNANSWERED"
      : r?.isCorrect === null
        ? "AWAITING"
        : r?.isCorrect
          ? "CORRECT"
          : "WRONG";
    const key =
      q.type === "SHORT_ANSWER"
        ? (q.correctAnswer ?? "")
        : wordsFor(q.options, q.options.filter((o) => o.isCorrect).map((o) => o.id));
    return {
      questionId: q.id,
      number: i + 1,
      text: q.text,
      type: q.type,
      points: q.points,
      pointsAwarded: r?.points ?? 0,
      state,
      yourAnswer: typed || wordsFor(q.options, chosen) || "",
      correctAnswer: key,
      explanation: q.explanation,
    };
  });

  const max = attempt.maxScore || attempt.assignment.maxScore || 0;
  const score = attempt.score ?? attempt.autoScore ?? 0;
  const percent = max > 0 ? Math.round((score / max) * 100) : 0;

  return {
    id: attempt.id,
    attemptNo: attempt.attemptNo,
    status: attempt.needsMarking ? "SUBMITTED" : "GRADED",
    score: attempt.score ?? attempt.autoScore,
    maxScore: max,
    percent,
    // An assignment has no pass mark of its own; anything marked counts.
    passed: !attempt.needsMarking && percent > 0,
    correct: questions.filter((q) => q.state === "CORRECT").length,
    wrong: questions.filter((q) => q.state === "WRONG").length,
    unanswered: questions.filter((q) => q.state === "UNANSWERED").length,
    awaiting: questions.filter((q) => q.state === "AWAITING").length,
    timeSpentSeconds: 0,
    startedAt: attempt.submittedAt.toISOString(),
    submittedAt: attempt.submittedAt.toISOString(),
    studentId: attempt.studentId,
    studentName: attempt.student.name,
    quizId: attempt.assignment.id,
    quizTitle: attempt.assignment.title,
    passingScore: 0,
    showAnswers: true,
    questions,
  };
}
