import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import type { CheckAnswerInput, SubmitQuizInput } from "@/lib/validations/quiz-attempt";
import { getSettings } from "./settings-service";
import { ACTIVITY_ACTIONS, logActivity } from "./activity-service";

// ── Reads ────────────────────────────────────────────────────────────────────

export interface StudentQuiz {
  id: string;
  title: string;
  description: string | null;
  courseTitle: string | null;
  questionCount: number;
  totalPoints: number;
  passingScore: number;
  maxAttempts: number;
  attemptsUsed: number;
  bestPercent: number | null;
  passed: boolean;
  /** Saved for later from the list or the quiz itself. */
  bookmarked: boolean;
  /** The academy's own grouping and numbering. */
  sequence: number;
  categoryName: string | null;
  subCategoryName: string | null;
}

export async function listStudentQuizzes(userId: string): Promise<StudentQuiz[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { courseId: true, batchId: true },
  });
  const courseIds = enrollments.map((e) => e.courseId);
  if (courseIds.length === 0) return [];
  const batchIds = enrollments
    .map((e) => e.batchId)
    .filter((id): id is string => Boolean(id));

  const quizzes = await prisma.quiz.findMany({
    // A quiz set for particular cohorts or named learners reaches only those;
    // one with neither reaches everyone on its course, as it always has. On top
    // of that, `releaseAt` holds it back until its moment — the assessment half
    // of "students ko saare quiz ek saath nhi denge".
    where: {
      isPublished: true,
      OR: [
        {
          courseId: { in: courseIds },
          batches: { none: {} },
          students: { none: {} },
        },
        ...(batchIds.length ? [{ batches: { some: { batchId: { in: batchIds } } } }] : []),
        { students: { some: { userId } } },
      ],
      AND: [{ OR: [{ releaseAt: null }, { releaseAt: { lte: new Date() } }] }],
    },
    // In the academy's order — "Quiz 1, Quiz 2, Quiz 3" is how the class is
    // told to work through them.
    orderBy: [{ sequence: "asc" }, { createdAt: "asc" }],
    include: {
      course: { select: { title: true } },
      category: { select: { name: true } },
      subCategory: { select: { name: true } },
      questions: { select: { points: true } },
      attempts: { where: { studentId: userId }, select: { score: true, maxScore: true } },
    },
  });

  // The platform default applies to any quiz that names no cap of its own —
  // the same sum the attempt page and the submit endpoint do, so "attempts
  // left" reads the same wherever a learner looks.
  const { settings } = await getSettings();

  // One flat read for the saved set rather than a relation on each quiz —
  // `relationMode = "prisma"` would make that a round trip per row.
  const saved = new Set(
    (
      await prisma.bookmark.findMany({
        where: { userId, quizId: { in: quizzes.map((z) => z.id) } },
        select: { quizId: true },
      })
    ).map((b) => b.quizId),
  );

  return quizzes.map((z) => {
    const totalPoints = z.questions.reduce((s, q) => s + q.points, 0);
    const percents = z.attempts
      .filter((a) => a.score != null && a.maxScore > 0)
      .map((a) => Math.round(((a.score as number) / a.maxScore) * 100));
    const best = percents.length ? Math.max(...percents) : null;
    return {
      id: z.id,
      title: z.title,
      description: z.description,
      courseTitle: z.course?.title ?? null,
      questionCount: z.questions.length,
      totalPoints,
      passingScore: z.passingScore,
      maxAttempts: z.maxAttempts || settings.quizAttemptLimit,
      attemptsUsed: z.attempts.length,
      bestPercent: best,
      passed: best != null && best >= z.passingScore,
      bookmarked: saved.has(z.id),
      sequence: z.sequence,
      categoryName: z.category?.name ?? null,
      subCategoryName: z.subCategory?.name ?? null,
    };
  });
}

/** Quiz + questions for taking — WITHOUT correct-answer flags. */
export async function getQuizForAttempt(userId: string, quizId: string) {
  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId, isPublished: true },
    include: {
      course: { select: { id: true, title: true } },
      category: { select: { name: true } },
      subCategory: { select: { name: true } },
      sources: { orderBy: { createdAt: "asc" }, select: { title: true } },
      questions: {
        orderBy: { order: "asc" },
        include: { options: { orderBy: { order: "asc" }, select: { id: true, text: true } } },
      },
    },
  });
  if (!quiz || !quiz.courseId) return null;
  // A quiz still under wraps is not takeable by URL either.
  if (quiz.releaseAt && quiz.releaseAt.getTime() > Date.now()) return null;

  const enrolled = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: quiz.courseId } },
    select: { id: true },
  });
  if (!enrolled) return null;

  const [attemptsUsed, bookmark, { settings }] = await Promise.all([
    prisma.quizAttempt.count({ where: { quizId, studentId: userId } }),
    prisma.bookmark.findFirst({ where: { userId, quizId }, select: { id: true } }),
    getSettings(),
  ]);
  // Same effective cap the submit path applies, so the button and the endpoint
  // never disagree about whether an attempt is left.
  const cap = quiz.maxAttempts || settings.quizAttemptLimit;

  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    courseTitle: quiz.course?.title ?? null,
    timeLimitMinutes: quiz.timeLimitMinutes,
    passingScore: quiz.passingScore,
    maxAttempts: cap,
    attemptsUsed,
    canAttempt: cap === 0 || attemptsUsed < cap,
    bookmarked: bookmark != null,
    /** Marks each question as it is answered, rather than only at the end. */
    showAnswerPerQuestion: quiz.showAnswerPerQuestion,
    categoryName: quiz.subCategory?.name ?? quiz.category?.name ?? null,
    /** The notes this paper was prepared from — what to revise. */
    preparedFrom: quiz.sources.map((s) => s.title),
    totalPoints: quiz.questions.reduce((s, q) => s + q.points, 0),
    questions: quiz.questions.map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      points: q.points,
      options: q.options,
    })),
  };
}

// ── Marking as you go ────────────────────────────────────────────────────────

export interface CheckedAnswer {
  questionId: string;
  isCorrect: boolean | null;
  correctOptionIds: string[];
  explanation: string | null;
}

/**
 * Mark one question mid-attempt, for quizzes set to answer as you go.
 *
 * The answer key never rides along with the paper — it is asked for one
 * question at a time, only for a quiz whose settings allow it, and only by
 * someone enrolled on the course. A written answer has no key to give, so it
 * comes back unmarked.
 */
export async function checkQuizAnswer(
  userId: string,
  quizId: string,
  input: CheckAnswerInput,
): Promise<CheckedAnswer> {
  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId, isPublished: true },
    select: { courseId: true, showAnswerPerQuestion: true, releaseAt: true },
  });
  if (!quiz || !quiz.courseId) throw AppError.notFound("Quiz not found.");
  if (!quiz.showAnswerPerQuestion) {
    throw AppError.badRequest("This quiz shows its answers at the end.");
  }
  if (quiz.releaseAt && quiz.releaseAt.getTime() > Date.now()) {
    throw AppError.badRequest("This quiz hasn't opened yet.");
  }

  const enrolled = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: quiz.courseId } },
    select: { id: true },
  });
  if (!enrolled) throw AppError.forbidden("You're not enrolled in this course.");

  const question = await prisma.question.findFirst({
    where: { id: input.questionId, quizId },
    select: {
      type: true,
      explanation: true,
      options: { select: { id: true, isCorrect: true } },
    },
  });
  if (!question) throw AppError.notFound("Question not found.");

  if (question.type === "SHORT_ANSWER") {
    return {
      questionId: input.questionId,
      isCorrect: null,
      correctOptionIds: [],
      explanation: question.explanation,
    };
  }

  const correctIds = question.options
    .filter((o) => o.isCorrect)
    .map((o) => o.id)
    .sort();
  const chosen = [...new Set(input.optionIds)].sort();
  return {
    questionId: input.questionId,
    isCorrect: correctIds.length === chosen.length && correctIds.every((id, i) => id === chosen[i]),
    correctOptionIds: correctIds,
    explanation: question.explanation,
  };
}

// ── Submit + auto-grade ──────────────────────────────────────────────────────

export interface QuizResult {
  score: number;
  maxScore: number;
  percent: number;
  passed: boolean;
  passingScore: number;
  attemptNo: number;
  breakdown: {
    questionId: string;
    isCorrect: boolean | null;
    correctOptionIds: string[];
    yourOptionIds: string[];
    explanation: string | null;
  }[];
  showAnswers: boolean;
}

export async function submitQuizAttempt(
  userId: string,
  quizId: string,
  input: SubmitQuizInput,
): Promise<QuizResult> {
  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId, isPublished: true },
    include: {
      questions: { include: { options: { select: { id: true, isCorrect: true } } } },
    },
  });
  if (!quiz || !quiz.courseId) throw AppError.notFound("Quiz not found.");

  const enrolled = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: quiz.courseId } },
    select: { id: true },
  });
  if (!enrolled) throw AppError.forbidden("You're not enrolled in this course.");

  if (quiz.releaseAt && quiz.releaseAt.getTime() > Date.now()) {
    throw AppError.badRequest("This quiz hasn't opened yet.");
  }

  // The quiz's own cap, else the platform default from Settings → Learning.
  // 0 in both means unlimited — an instructor who wants open practice sets it
  // to 0 rather than to some large number.
  const { settings } = await getSettings();
  const cap = quiz.maxAttempts || settings.quizAttemptLimit;
  const attemptsUsed = await prisma.quizAttempt.count({ where: { quizId, studentId: userId } });
  if (cap > 0 && attemptsUsed >= cap) {
    throw AppError.badRequest("You've used all your attempts for this quiz.");
  }

  const answerMap = new Map(input.answers.map((a) => [a.questionId, a.optionIds]));

  let score = 0;
  let maxScore = 0;
  const breakdown: QuizResult["breakdown"] = [];
  const responses: { questionId: string; selected: string[]; isCorrect: boolean | null; points: number }[] = [];

  for (const q of quiz.questions) {
    maxScore += q.points;
    const selected = answerMap.get(q.id) ?? [];
    const correctIds = q.options.filter((o) => o.isCorrect).map((o) => o.id).sort();

    let isCorrect: boolean | null;
    let points = 0;
    if (q.type === "SHORT_ANSWER") {
      isCorrect = null; // needs manual grading
    } else {
      const sel = [...selected].sort();
      isCorrect = correctIds.length === sel.length && correctIds.every((id, i) => id === sel[i]);
      points = isCorrect ? q.points : 0;
    }
    score += points;
    responses.push({ questionId: q.id, selected, isCorrect, points });
    breakdown.push({
      questionId: q.id,
      isCorrect,
      correctOptionIds: correctIds,
      yourOptionIds: selected,
      explanation: q.explanation,
    });
  }

  const percent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const passed = percent >= quiz.passingScore;
  const attemptNo = attemptsUsed + 1;
  const now = new Date();

  const attempt = await prisma.quizAttempt.create({
    data: {
      quizId,
      studentId: userId,
      attemptNo,
      status: "GRADED",
      score,
      maxScore,
      timeSpentSeconds: input.timeSpentSeconds ?? 0,
      submittedAt: now,
      gradedAt: now,
      responses: {
        create: responses.map((r) => ({
          questionId: r.questionId,
          selectedOptions: r.selected as Prisma.InputJsonValue,
          isCorrect: r.isCorrect,
          pointsAwarded: r.points,
        })),
      },
    },
    select: { id: true },
  });
  void attempt;

  void logActivity({
    userId,
    action: ACTIVITY_ACTIONS.QUIZ_SUBMIT,
    entityType: "Quiz",
    entityId: quizId,
    description: `Scored ${percent}% on “${quiz.title}”`,
    metadata: { score, maxScore, percent, passed },
  });

  return {
    score,
    maxScore,
    percent,
    passed,
    passingScore: quiz.passingScore,
    attemptNo,
    breakdown,
    showAnswers: quiz.showAnswers,
  };
}
